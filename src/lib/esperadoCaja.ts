import type { CajaDiaria, MovimientoFinanciero } from './types';
import { cuentaCajaDiaId } from './finance';

/**
 * Los movimientos hechos mientras la caja estuvo abierta (de la apertura al cierre),
 * no todo lo del día ni lo acumulado: así cada turno ve solo lo suyo.
 */
export const movimientosDeLaCaja = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) => {
  const desde = caja.opened_at;
  const hasta = caja.closed_at;
  if (!desde) return movimientos.filter(mov => mov.fecha === caja.fecha);
  return movimientos.filter(mov => mov.created_at
    ? mov.created_at >= desde && (!hasta || mov.created_at <= hasta)
    : mov.fecha === caja.fecha);
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un traspaso marcado como plata de transferencias o tarjeta no pasa por el cajón. */
const noEsEfectivo = (mov: MovimientoFinanciero) => /\(transferencias\/tarjeta\)/.test(mov.descripcion || '');
/** El pase del efectivo a la caja grande al cerrar no es parte del turno. */
const esCierre = (mov: MovimientoFinanciero) => /^cierre/i.test(mov.descripcion || '');

/**
 * Rehace el efectivo esperado del cajón con lo que pasó por la cuenta Caja del día mientras la caja
 * estuvo abierta: fondo inicial y ventas en efectivo entran; gastos en efectivo, anulaciones y retiros salen.
 * Lo pagado por transferencia o tarjeta no cuenta, aunque se haya anotado contra la Caja del día.
 */
export const recalcularEsperadoEfectivo = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) => {
  let esperado = 0;
  for (const mov of movimientosDeLaCaja(caja, movimientos)) {
    if (mov.tipo === 'transferencia') {
      if (noEsEfectivo(mov)) continue;
      if (mov.cuenta_destino_id === cuentaCajaDiaId) esperado += mov.monto;
      else if (mov.cuenta_id === cuentaCajaDiaId && !esCierre(mov)) esperado -= mov.monto;
      continue;
    }
    if (mov.cuenta_id !== cuentaCajaDiaId) continue;
    if (mov.tipo === 'entrada') esperado += mov.monto;
    else if (mov.tipo === 'salida' && (!mov.metodo_pago || mov.metodo_pago === 'efectivo')) esperado -= mov.monto;
  }
  return redondear(esperado);
};
