import type { CajaDiaria, MovimientoFinanciero, Pago } from './types';
import { cuentaCajaDiaId, cuentaCajaGrandeId, loadMovimientosFinancieros } from './finance';
import { loadCajasDiarias } from './cajaStore';
import { dayKey } from './fechas';

const momento = (fecha?: string) => {
  const ms = fecha ? Date.parse(fecha) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Si algo se anotó mientras la caja estuvo abierta (de la apertura al cierre).
 * Se comparan instantes y no textos: un horario que vuelve de otro equipo puede venir
 * escrito distinto ("...Z" o "...+00:00", con o sin milésimas) y la comparación de texto fallaba.
 * Una caja vieja sin hora de apertura se arma con el día de la jornada.
 */
export const dentroDeLaCaja = (caja: CajaDiaria, fecha: string | undefined, diaDelRegistro?: string) => {
  const desde = momento(caja.opened_at);
  const hasta = momento(caja.closed_at);
  const cuando = momento(fecha);
  if (desde === null || cuando === null) return (diaDelRegistro ?? (fecha ? dayKey(fecha) : '')) === caja.fecha;
  return cuando >= desde && (hasta === null || cuando <= hasta);
};

/**
 * Los movimientos hechos mientras la caja estuvo abierta (de la apertura al cierre),
 * no todo lo del día ni lo acumulado: así cada turno ve solo lo suyo.
 */
export const movimientosDeLaCaja = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) =>
  movimientos.filter(mov => dentroDeLaCaja(caja, mov.created_at, mov.fecha));

/** Los cobros que entraron mientras esta caja estuvo abierta, del más viejo al más nuevo. */
export const pagosDeLaCaja = (caja: CajaDiaria, pagos: Pago[]) =>
  pagos
    .filter(pago => dentroDeLaCaja(caja, pago.created_at))
    .sort((a, b) => (momento(a.created_at) ?? 0) - (momento(b.created_at) ?? 0));

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un traspaso marcado como plata de transferencias o tarjeta no pasa por el cajón. */
const noEsEfectivo = (mov: MovimientoFinanciero) => /\(transferencias\/tarjeta\)/.test(mov.descripcion || '');
/** El pase del efectivo a la caja grande al cerrar no es parte del turno. */
const esCierre = (mov: MovimientoFinanciero) => /^cierre/i.test(mov.descripcion || '');
/** Lo que devuelve la plata de un gasto borrado o editado ("Anulacion de gasto: Luz"). */
const reversionDeGasto = /^(anulaci[oó]n|edici[oó]n) de gasto: /i;

/**
 * Saca los gastos que después se borraron o se editaron, junto con la devolución de su plata.
 * Al editar un gasto se devuelve la plata del original y se anota el nuevo: sin esto el arqueo
 * mostraba los dos y el gasto aparecía duplicado. Al esperado no le cambia nada (los pares suman cero).
 */
export const sinGastosRevertidos = (movimientos: MovimientoFinanciero[]) => {
  const ordenados = [...movimientos].sort((a, b) => (momento(a.created_at) ?? 0) - (momento(b.created_at) ?? 0));
  const fuera = new Set<string>();
  for (const devolucion of ordenados) {
    if (devolucion.tipo !== 'entrada' || devolucion.origen !== 'ajuste') continue;
    const texto = devolucion.descripcion || '';
    if (!reversionDeGasto.test(texto)) continue;
    const concepto = texto.replace(reversionDeGasto, '');
    // El gasto devuelto es el último anterior con la misma cuenta, el mismo importe y el mismo concepto.
    const original = ordenados
      .filter(mov => !fuera.has(mov.id)
        && mov.tipo === 'salida'
        && mov.cuenta_id === devolucion.cuenta_id
        && Math.abs(mov.monto - devolucion.monto) < 0.009
        && (mov.descripcion || '') === concepto
        && (momento(mov.created_at) ?? 0) <= (momento(devolucion.created_at) ?? 0))
      .pop();
    if (!original) continue;
    fuera.add(original.id);
    fuera.add(devolucion.id);
  }
  return movimientos.filter(mov => !fuera.has(mov.id));
};

const salioEfectivoDelCajon = (mov: MovimientoFinanciero) =>
  mov.tipo === 'salida' && mov.cuenta_id === cuentaCajaDiaId && (!mov.metodo_pago || mov.metodo_pago === 'efectivo');

/**
 * El efectivo que salió del cajón en gastos (también sueldos y proveedores pagados en efectivo)
 * mientras la caja estuvo abierta. No cuenta anulaciones de venta ni traspasos/retiros.
 */
export const efectivoGastadoDeLaCaja = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) =>
  redondear(sinGastosRevertidos(movimientosDeLaCaja(caja, movimientos))
    .filter(mov => salioEfectivoDelCajon(mov) && mov.origen !== 'venta' && mov.origen !== 'ajuste')
    .reduce((suma, mov) => suma + mov.monto, 0));

/**
 * Rehace el efectivo esperado del cajón con lo que pasó por la cuenta Caja del día mientras la caja
 * estuvo abierta: fondo inicial y ventas en efectivo entran; gastos en efectivo, anulaciones y retiros salen.
 * Lo pagado por transferencia o tarjeta no cuenta, aunque se haya anotado contra la Caja del día.
 */
export const recalcularEsperadoEfectivo = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) => {
  let esperado = 0;
  for (const mov of movimientosDeLaCaja(caja, movimientos)) {
    // El pase a la caja grande y el ajuste del cierre no son parte del turno.
    if (esCierre(mov)) continue;
    if (mov.tipo === 'transferencia') {
      if (noEsEfectivo(mov)) continue;
      if (mov.cuenta_destino_id === cuentaCajaDiaId) esperado += mov.monto;
      else if (mov.cuenta_id === cuentaCajaDiaId && !esCierre(mov)) esperado -= mov.monto;
      continue;
    }
    if (mov.cuenta_id !== cuentaCajaDiaId) continue;
    if (mov.tipo === 'entrada') esperado += mov.monto;
    else if (salioEfectivoDelCajon(mov)) esperado -= mov.monto;
  }
  return redondear(esperado);
};

/**
 * Lo que un cierre automático de medianoche (versiones anteriores) ya mandó a la Caja grande mientras
 * esta caja estaba abierta. Al cerrar se descuenta de lo contado para no pasarlo dos veces.
 */
export const yaPasadoACajaGrande = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) =>
  redondear(movimientosDeLaCaja(caja, movimientos)
    .filter(mov => mov.tipo === 'transferencia'
      && mov.cuenta_id === cuentaCajaDiaId
      && mov.cuenta_destino_id === cuentaCajaGrandeId
      && /^cierre autom/i.test(mov.descripcion || ''))
    .reduce((suma, mov) => suma + mov.monto, 0));

/**
 * La caja que está abierta ahora. Primero la de la jornada de hoy; si no hay, una que quedó abierta
 * de una jornada anterior (se olvidaron de cerrarla): esa hay que cerrarla antes de abrir otra,
 * si no sus gastos y cobros quedaban sin hora de cierre y se mezclaban con los del turno siguiente.
 */
export const cajaAbiertaActual = (cajas: CajaDiaria[], hoy = dayKey()) => {
  const abiertas = cajas.filter(caja => caja.estado === 'abierta');
  return abiertas.find(caja => caja.fecha === hoy)
    || [...abiertas].sort((a, b) => (b.opened_at || b.fecha).localeCompare(a.opened_at || a.fecha))[0]
    || null;
};

/**
 * El efectivo que tiene el cajón de la caja abierta (la de esa jornada, o la que quedó abierta).
 * Se toma el mayor entre el "Esperado efectivo" que muestra la pantalla de Caja (rehecho con los movimientos)
 * y el número guardado en la caja. Antes solo se usaba el guardado, que se va sumando de a poco y podía quedar
 * atrasado (por ejemplo, $64.000 guardados con $237.000 en el cajón), y frenaba gastos que el cajón sí podía pagar.
 * Sin caja abierta es cero: al cerrar, el efectivo pasó a la Caja grande.
 */
export const efectivoEnCajaAbierta = (fecha?: string) => {
  const abiertas = loadCajasDiarias().filter(item => item.estado === 'abierta');
  const caja = (fecha && abiertas.find(item => item.fecha === fecha))
    || [...abiertas].sort((a, b) => (b.opened_at || b.fecha).localeCompare(a.opened_at || a.fecha))[0];
  if (!caja) return 0;
  return Math.max(caja.monto_esperado_efectivo || 0, recalcularEsperadoEfectivo(caja, loadMovimientosFinancieros()));
};
