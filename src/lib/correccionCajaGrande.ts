import type { CajaDiaria, MovimientoFinanciero } from './types';
import { cuentaCajaDiaId, cuentaCajaGrandeId, loadCuentasDinero, loadMovimientosFinancieros, saveCuentasDinero, saveMovimientosFinancieros } from './finance';
import { loadCajasDiarias } from './cajaStore';
import { dayKey } from './fechas';
import { nuevoId } from './ids';
import { withStoreTransaction } from './storeSync';

/**
 * Rehace la Caja grande con los arqueos: en cada caja cerrada, a la Caja grande tenía que entrar
 * el efectivo contado en el cajón. Antes del arreglo entraba el saldo de la cuenta Caja del día
 * (o lo pasaba solo el cierre de medianoche), así que cada día pudo entrar de más o de menos.
 */
export type RevisionArqueo = {
  cajaId: string;
  fecha: string;
  cajero?: string;
  /** El efectivo contado en el arqueo: lo que tenía que entrar. */
  contado: number;
  /** Lo que entró de verdad a la Caja grande por ese cierre (incluye correcciones ya hechas). */
  entro: number;
  /** contado − entro: lo que falta sumar (positivo) o sacar (negativo) de la Caja grande. */
  diferencia: number;
};

const redondear = (n: number) => Math.round(n * 100) / 100;
const ms = (fecha?: string) => {
  const valor = fecha ? Date.parse(fecha) : NaN;
  return Number.isNaN(valor) ? null : valor;
};
/** Los pases del cierre se anotan en el momento de cerrar; se da un margen por si quedaron unos segundos después. */
const margenCierre = 5 * 60 * 1000;

const prefijoCorreccion = 'Corrección con el arqueo';
const marcaCaja = (cajaId: string) => `(caja ${cajaId})`;

const esPaseDeCierre = (mov: MovimientoFinanciero) =>
  mov.tipo === 'transferencia'
  && /^cierre/i.test(mov.descripcion || '')
  && ((mov.cuenta_id === cuentaCajaDiaId && mov.cuenta_destino_id === cuentaCajaGrandeId)
    || (mov.cuenta_id === cuentaCajaGrandeId && mov.cuenta_destino_id === cuentaCajaDiaId));

/** Con signo: lo que sumó a la Caja grande. */
const aportaACajaGrande = (mov: MovimientoFinanciero) => (mov.cuenta_destino_id === cuentaCajaGrandeId ? mov.monto : -mov.monto);

export const revisarCajaGrandeConArqueos = (
  cajas: CajaDiaria[] = loadCajasDiarias(),
  movimientos: MovimientoFinanciero[] = loadMovimientosFinancieros(),
): RevisionArqueo[] => {
  const cerradas = cajas
    .filter(caja => caja.estado === 'cerrada' && typeof caja.monto_cierre_efectivo === 'number' && Number.isFinite(caja.monto_cierre_efectivo))
    .sort((a, b) => (ms(a.closed_at) ?? 0) - (ms(b.closed_at) ?? 0));
  const pases = movimientos.filter(esPaseDeCierre);
  const usados = new Set<string>();

  return cerradas.map(caja => {
    const desde = ms(caja.opened_at);
    const hasta = ms(caja.closed_at);
    const suyos = pases.filter(mov => {
      if (usados.has(mov.id)) return false;
      const cuando = ms(mov.created_at);
      if (desde !== null && hasta !== null && cuando !== null) return cuando >= desde && cuando <= hasta + margenCierre;
      // Cajas viejas sin horario: el cierre trae la fecha de la jornada en el texto o en la fecha.
      return (mov.descripcion || '').includes(caja.fecha) || (mov.fecha === caja.fecha && /^cierre de caja/i.test(mov.descripcion || ''));
    });
    suyos.forEach(mov => usados.add(mov.id));
    const correcciones = movimientos.filter(mov => mov.origen === 'ajuste'
      && mov.cuenta_id === cuentaCajaGrandeId
      && (mov.descripcion || '').startsWith(prefijoCorreccion)
      && (mov.descripcion || '').includes(marcaCaja(caja.id)));
    const entro = redondear(
      suyos.reduce((suma, mov) => suma + aportaACajaGrande(mov), 0)
      + correcciones.reduce((suma, mov) => suma + (mov.tipo === 'entrada' ? mov.monto : -mov.monto), 0),
    );
    const contado = redondear(caja.monto_cierre_efectivo as number);
    return {
      cajaId: caja.id,
      fecha: caja.fecha,
      cajero: caja.cerrado_por_nombre || caja.cajero_nombre,
      contado,
      entro,
      diferencia: redondear(contado - entro),
    };
  });
};

/** Las cajas que hay que corregir (diferencia de un peso o más). */
export const arqueosConDiferencia = (revision: RevisionArqueo[]) => revision.filter(fila => Math.abs(fila.diferencia) >= 1);

/**
 * Corrige la Caja grande con un ajuste por cada caja con diferencia. Queda anotado con el id de la caja,
 * así una segunda revisión ya lo cuenta y no se corrige dos veces.
 */
export const corregirCajaGrandeConArqueos = (creadoPor?: string) => withStoreTransaction(() => {
  const pendientes = arqueosConDiferencia(revisarCajaGrandeConArqueos());
  if (!pendientes.length) return 0;
  const ahora = new Date().toISOString();
  const hoy = dayKey();
  const total = redondear(pendientes.reduce((suma, fila) => suma + fila.diferencia, 0));

  saveCuentasDinero(loadCuentasDinero().map(cuenta => (
    cuenta.id === cuentaCajaGrandeId ? { ...cuenta, saldo: redondear(cuenta.saldo + total) } : cuenta
  )));
  const nuevos: MovimientoFinanciero[] = pendientes.map(fila => ({
    id: nuevoId('mov-fin'),
    fecha: hoy,
    tipo: fila.diferencia > 0 ? 'entrada' : 'salida',
    origen: 'ajuste',
    cuenta_id: cuentaCajaGrandeId,
    monto: Math.abs(fila.diferencia),
    descripcion: `${prefijoCorreccion} del ${fila.fecha}: se contaron ${fila.contado} y entraron ${fila.entro} ${marcaCaja(fila.cajaId)}`,
    created_at: ahora,
    creado_por: creadoPor,
  }));
  saveMovimientosFinancieros([...nuevos, ...loadMovimientosFinancieros()]);
  return total;
});
