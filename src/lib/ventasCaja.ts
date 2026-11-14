import type { Pago, Pedido } from './types';

export type MedioVenta = 'efectivo' | 'tarjeta' | 'transferencia';

/** Cuánto de un cobro entró por ese medio (un pago mixto aparece en cada medio con su parte). */
export const parteDeVenta = (pago: Pago, medio: MedioVenta | 'total') => {
  if (medio === 'total') return pago.total_cobrado ?? pago.monto;
  if (medio === 'efectivo') return pago.monto_efectivo || 0;
  if (medio === 'transferencia') return pago.monto_transferencia || 0;
  return (pago.monto_tarjeta || 0) + (pago.monto_debito || 0) + (pago.monto_credito || 0);
};

/** Los cobros de un renglón de "Ventas del día", con lo que entró por ese medio. */
export const ventasDeMedio = (pagos: Pago[], medio: MedioVenta | 'total') =>
  pagos
    .map(pago => ({ pago, monto: parteDeVenta(pago, medio) }))
    .filter(venta => venta.monto > 0);

/** "2x Light, 1x Fit": lo que se vendió en ese cobro. */
export const productosVendidos = (pedido?: Pedido) =>
  (pedido?.items || [])
    .filter(item => item.estado !== 'cancelado')
    .map(item => `${item.cantidad}x ${item.producto?.nombre || 'Producto'}`)
    .join(', ');
