import type { MetodoPago, MovimientoFinanciero } from './types';
import { cuentaCajaDiaId, cuentaCajaGrandeId } from './finance';

/** En qué se fue la plata del día, para el arqueo. Los proveedores van aparte, se paguen como se paguen. */
export type ResumenGastosCaja = {
  /** En efectivo, de la caja del día (el cajón). */
  efectivo: number;
  /** Lo que salió de la caja grande (no toca el cajón del turno). */
  cajaGrande: number;
  proveedores: number;
  transferencia: number;
  tarjeta: number;
  /** Efectivo de otras cuentas y salidas sin medio de pago anotado (retiros). */
  otros: number;
  total: number;
};

export type CategoriaGastoCaja = Exclude<keyof ResumenGastosCaja, 'total'>;

const transferencias: MetodoPago[] = ['transferencia', 'mercado_pago'];
const tarjetas: MetodoPago[] = ['tarjeta', 'debito', 'credito'];

const redondear = (n: number) => Math.round(n * 100) / 100;

/** A qué renglón del resumen va un movimiento, o null si no es un gasto (entradas, traspasos entre cuentas). */
export const categoriaGastoCaja = (mov: MovimientoFinanciero): CategoriaGastoCaja | null => {
  // Las anulaciones de venta (ajuste) ya se restaron de las ventas: no son gastos.
  if (mov.tipo !== 'salida' || mov.origen === 'venta' || mov.origen === 'ajuste') return null;
  if (mov.origen === 'pago_proveedor' || mov.origen === 'compra' || mov.proveedor_id) return 'proveedores';
  if (mov.cuenta_id === cuentaCajaGrandeId) return 'cajaGrande';
  if (mov.metodo_pago === 'efectivo') return mov.cuenta_id === cuentaCajaDiaId ? 'efectivo' : 'otros';
  if (mov.metodo_pago && transferencias.includes(mov.metodo_pago)) return 'transferencia';
  if (mov.metodo_pago && tarjetas.includes(mov.metodo_pago)) return 'tarjeta';
  return 'otros';
};

/** Los gastos de un renglón ('total': todos), para ver el detalle al tocarlo. */
export const gastosDeCategoria = (movimientos: MovimientoFinanciero[], categoria: CategoriaGastoCaja | 'total') =>
  movimientos.filter(mov => {
    const propia = categoriaGastoCaja(mov);
    return propia !== null && (categoria === 'total' || propia === categoria);
  });

export const resumenGastosCaja = (movimientos: MovimientoFinanciero[]): ResumenGastosCaja => {
  const resumen = { efectivo: 0, cajaGrande: 0, proveedores: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 };
  for (const mov of movimientos) {
    const categoria = categoriaGastoCaja(mov);
    if (!categoria) continue;
    resumen[categoria] += mov.monto;
    resumen.total += mov.monto;
  }
  return Object.fromEntries(Object.entries(resumen).map(([clave, valor]) => [clave, redondear(valor)])) as ResumenGastosCaja;
};
