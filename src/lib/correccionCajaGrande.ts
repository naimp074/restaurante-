import type { MovimientoFinanciero } from './types';
import { cuentaCajaGrandeId, loadCuentasDinero, loadMovimientosFinancieros, saveCuentasDinero, saveMovimientosFinancieros } from './finance';
import { dayKey } from './fechas';
import { nuevoId } from './ids';
import { withStoreTransaction } from './storeSync';

/*
 * La Caja grande de días anteriores NO se rehace con los arqueos.
 *
 * Se probó: para cada caja cerrada se comparaba lo contado con los pases del cierre que había en los movimientos,
 * y se sumaba la diferencia. Sumó de más: buena parte de esa plata ya había entrado a la Caja grande
 * (el saldo se movió bien) pero su movimiento no estaba donde se lo buscaba (se perdió al sincronizar entre equipos,
 * o quedó con otra hora o descripción). Esos días se contaron dos veces.
 *
 * Lo único seguro para el pasado es contar la caja fuerte y ajustar a eso. De acá en adelante cada cierre
 * pasa exactamente lo contado (ver cerrarCajaDia en finance.ts).
 */

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Los ajustes que hizo la corrección por arqueos (versión retirada). */
const prefijoCorreccionArqueo = 'Corrección con el arqueo';
export const esCorreccionArqueo = (mov: Pick<MovimientoFinanciero, 'origen' | 'cuenta_id' | 'descripcion'>) =>
  mov.origen === 'ajuste' && mov.cuenta_id === cuentaCajaGrandeId && (mov.descripcion || '').startsWith(prefijoCorreccionArqueo);

const prefijoConteo = 'Ajuste por conteo de la caja fuerte';
export const esAjustePorConteo = (mov: Pick<MovimientoFinanciero, 'origen' | 'cuenta_id' | 'descripcion'>) =>
  mov.origen === 'ajuste' && mov.cuenta_id === cuentaCajaGrandeId && (mov.descripcion || '').startsWith(prefijoConteo);

const efecto = (mov: MovimientoFinanciero) => (mov.tipo === 'entrada' ? mov.monto : -mov.monto);

/** Cuánto movió en total la corrección por arqueos (lo que hay que sacar para deshacerla). */
export const totalCorreccionArqueos = (movimientos: MovimientoFinanciero[] = loadMovimientosFinancieros()) => {
  const correcciones = movimientos.filter(esCorreccionArqueo);
  return { cantidad: correcciones.length, total: redondear(correcciones.reduce((suma, mov) => suma + efecto(mov), 0)) };
};

/** Saca los ajustes de la corrección por arqueos y deja la Caja grande como estaba antes. Devuelve lo que restó. */
export const deshacerCorreccionArqueos = () => withStoreTransaction(() => {
  const movimientos = loadMovimientosFinancieros();
  const { cantidad, total } = totalCorreccionArqueos(movimientos);
  if (!cantidad) return 0;
  saveCuentasDinero(loadCuentasDinero().map(cuenta => (
    cuenta.id === cuentaCajaGrandeId ? { ...cuenta, saldo: redondear(cuenta.saldo - total) } : cuenta
  )));
  saveMovimientosFinancieros(movimientos.filter(mov => !esCorreccionArqueo(mov)));
  return total;
});

/**
 * Deja la Caja grande en lo que se contó en la caja fuerte. La diferencia queda anotada como ajuste.
 * Devuelve la diferencia aplicada (positiva si había más plata que lo que decía el sistema).
 */
export const ajustarCajaGrandeAlConteo = (contado: number, creadoPor?: string) => withStoreTransaction(() => {
  if (!Number.isFinite(contado) || contado < 0) throw new Error('Ingresá lo que contaste en la caja fuerte (cero o más).');
  const cuentas = loadCuentasDinero();
  const grande = cuentas.find(cuenta => cuenta.id === cuentaCajaGrandeId);
  if (!grande) throw new Error('No se encontró la Caja grande.');
  const diferencia = redondear(contado - grande.saldo);
  if (Math.abs(diferencia) < 0.01) return 0;
  saveCuentasDinero(cuentas.map(cuenta => (cuenta.id === cuentaCajaGrandeId ? { ...cuenta, saldo: redondear(contado) } : cuenta)));
  const movimiento: MovimientoFinanciero = {
    id: nuevoId('mov-fin'),
    fecha: dayKey(),
    tipo: diferencia > 0 ? 'entrada' : 'salida',
    origen: 'ajuste',
    cuenta_id: cuentaCajaGrandeId,
    monto: Math.abs(diferencia),
    descripcion: `${prefijoConteo}: se contaron $${contado.toLocaleString('es-AR')} y el sistema decía $${grande.saldo.toLocaleString('es-AR')}`,
    created_at: new Date().toISOString(),
    creado_por: creadoPor,
  };
  saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
  return diferencia;
});
