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

const motivosReversion = ['Anulacion de gasto: ', 'Edicion de gasto: '];
const claveSalida = (cuenta: string | undefined, monto: number, descripcion: string) =>
  `${cuenta || ''}|${Math.round(monto * 100)}|${descripcion.trim()}`;

/**
 * Saca los gastos que después se borraron o se editaron: al hacerlo se devuelve la plata con
 * una entrada "Anulacion de gasto: X" o "Edicion de gasto: X". Esa salida ya no es un gasto del
 * día; si se editó, el gasto con el monto nuevo es otra salida y esa sí queda.
 */
export const sinGastosRevertidos = (movimientos: MovimientoFinanciero[]) => {
  const anuladas = new Set<string>();
  const ordenados = [...movimientos].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  ordenados.forEach((mov, indice) => {
    if (mov.tipo !== 'entrada' || mov.origen !== 'ajuste') return;
    const motivo = motivosReversion.find(m => (mov.descripcion || '').startsWith(m));
    if (!motivo) return;
    const buscada = claveSalida(mov.cuenta_id, mov.monto, mov.descripcion.slice(motivo.length));
    // La salida más reciente anterior a la devolución que todavía no se anuló.
    for (let i = indice - 1; i >= 0; i -= 1) {
      const salida = ordenados[i];
      if (salida.tipo !== 'salida' || salida.origen !== 'gasto' || anuladas.has(salida.id)) continue;
      if (claveSalida(salida.cuenta_id, salida.monto, salida.descripcion || '') !== buscada) continue;
      anuladas.add(salida.id);
      return;
    }
  });
  return anuladas.size ? movimientos.filter(mov => !anuladas.has(mov.id)) : movimientos;
};

/** Los gastos de un renglón ('total': todos), para ver el detalle al tocarlo. */
export const gastosDeCategoria = (movimientos: MovimientoFinanciero[], categoria: CategoriaGastoCaja | 'total') =>
  sinGastosRevertidos(movimientos).filter(mov => {
    const propia = categoriaGastoCaja(mov);
    return propia !== null && (categoria === 'total' || propia === categoria);
  });

export const resumenGastosCaja = (movimientos: MovimientoFinanciero[]): ResumenGastosCaja => {
  const resumen = { efectivo: 0, cajaGrande: 0, proveedores: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 };
  for (const mov of sinGastosRevertidos(movimientos)) {
    const categoria = categoriaGastoCaja(mov);
    if (!categoria) continue;
    resumen[categoria] += mov.monto;
    resumen.total += mov.monto;
  }
  return Object.fromEntries(Object.entries(resumen).map(([clave, valor]) => [clave, redondear(valor)])) as ResumenGastosCaja;
};
