import type { MetodoPago, MovimientoFinanciero } from './types';

/** En qué se fue la plata del día, para el arqueo. Los proveedores van aparte, se paguen como se paguen. */
export type ResumenGastosCaja = {
  efectivo: number;
  proveedores: number;
  transferencia: number;
  tarjeta: number;
  /** Salidas sin medio de pago anotado (retiros, ajustes viejos). */
  otros: number;
  total: number;
};

const transferencias: MetodoPago[] = ['transferencia', 'mercado_pago'];
const tarjetas: MetodoPago[] = ['tarjeta', 'debito', 'credito'];

const redondear = (n: number) => Math.round(n * 100) / 100;

export const resumenGastosCaja = (movimientos: MovimientoFinanciero[]): ResumenGastosCaja => {
  const resumen = { efectivo: 0, proveedores: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 };
  for (const mov of movimientos) {
    // Solo lo que salió: los movimientos entre cuentas no son gastos.
    if (mov.tipo !== 'salida' || mov.origen === 'venta') continue;
    if (mov.origen === 'pago_proveedor' || mov.origen === 'compra' || mov.proveedor_id) resumen.proveedores += mov.monto;
    else if (mov.metodo_pago === 'efectivo') resumen.efectivo += mov.monto;
    else if (mov.metodo_pago && transferencias.includes(mov.metodo_pago)) resumen.transferencia += mov.monto;
    else if (mov.metodo_pago && tarjetas.includes(mov.metodo_pago)) resumen.tarjeta += mov.monto;
    else resumen.otros += mov.monto;
    resumen.total += mov.monto;
  }
  return Object.fromEntries(Object.entries(resumen).map(([clave, valor]) => [clave, redondear(valor)])) as ResumenGastosCaja;
};
