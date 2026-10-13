import type {
  CuentaDinero,
  Gasto,
  EstadoFacturaProveedor,
  FacturaProveedor,
  MetodoPago,
  MovimientoFinanciero,
  PagoProveedor,
} from './types';
import { dayKey } from './fechas';
import { withStoreTransaction, writeStore } from './storeSync';
import { loadGastos, saveGastos } from './gastosStore';
import { aplicarGastoEnCajaDia } from './cajaStore';
import { nuevoId } from './ids';

export const cuentasDineroStorageKey = 'restaurant-cuentas-dinero';
export const movimientosFinancierosStorageKey = 'restaurant-movimientos-financieros';
export const facturasProveedorStorageKey = 'restaurant-facturas-proveedor';
export const pagosProveedorStorageKey = 'restaurant-pagos-proveedor';

const todayKey = () => dayKey();
const createId = (prefix: string) => nuevoId(prefix);

/** Tesoreria acumulada. Conserva el id historico para no romper los movimientos ya guardados. */
export const cuentaCajaGrandeId = 'cuenta-caja-grande';
/** Efectivo del mostrador. Arranca en cero cada jornada y al cerrar la caja pasa a la caja grande. */
export const cuentaCajaDiaId = 'cuenta-caja-dia';
export const cuentaBancoId = 'cuenta-banco';
const cuentaCajaChicaId = 'cuenta-caja-chica';
const nombreCajaGrande = 'Caja grande';
const nombreCajaDia = 'Caja del día';

const nuevaCuentaCajaDia = (fecha: string): CuentaDinero => ({
  id: cuentaCajaDiaId,
  nombre: nombreCajaDia,
  tipo: 'efectivo',
  saldo: 0,
  activa: true,
  created_at: new Date().toISOString(),
  saldo_fecha: fecha,
});

const defaultCuentas: CuentaDinero[] = [
  nuevaCuentaCajaDia(dayKey()),
  { id: cuentaCajaGrandeId, nombre: nombreCajaGrande, tipo: 'efectivo', saldo: 0, activa: true, created_at: new Date().toISOString() },
  { id: cuentaBancoId, nombre: 'Banco', tipo: 'banco', saldo: 0, activa: true, created_at: new Date().toISOString() },
  { id: 'cuenta-mercado-pago', nombre: 'Mercado Pago', tipo: 'billetera_virtual', saldo: 0, activa: true, created_at: new Date().toISOString() },
];

const readStorage = <T>(key: string, fallback: T): T => {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
};

const writeStorage = <T>(key: string, value: T) => {
  writeStore(key, value, `${key}-updated`);
};

const getFacturaEstado = (factura: Pick<FacturaProveedor, 'total' | 'pagado' | 'vencimiento'>): EstadoFacturaProveedor => {
  if (factura.pagado >= factura.total) return 'pagada';
  const diff = Math.ceil((new Date(`${factura.vencimiento}T00:00:00`).getTime() - new Date().getTime()) / 86400000);
  if (diff < 0) return 'vencida';
  if (diff <= 3) return 'por_vencer';
  return 'pendiente';
};

const esCajaChica = (cuenta: CuentaDinero) =>
  cuenta.id === cuentaCajaChicaId || cuenta.nombre.trim().toLowerCase() === 'caja chica';

/**
 * Deja el esquema en dos cajas de efectivo separadas: la caja grande acumula la tesoreria
 * (absorbiendo el saldo historico y el de la vieja caja chica) y la caja del dia arranca en cero.
 */
const separarCajas = (cuentas: CuentaDinero[], hoy: string): CuentaDinero[] => {
  const yaMigrado = cuentas.some(cuenta => cuenta.id === cuentaCajaDiaId) && !cuentas.some(esCajaChica);
  if (yaMigrado) return cuentas;

  const acumulado = cuentas
    .filter(cuenta => esCajaChica(cuenta) || cuenta.id === cuentaCajaGrandeId)
    .reduce((sum, cuenta) => sum + cuenta.saldo, 0);
  const grandeExistente = cuentas.find(cuenta => cuenta.id === cuentaCajaGrandeId);

  const cajaGrande: CuentaDinero = {
    ...(grandeExistente || { tipo: 'efectivo', activa: true, created_at: new Date().toISOString() } as CuentaDinero),
    id: cuentaCajaGrandeId,
    nombre: nombreCajaGrande,
    tipo: 'efectivo',
    saldo: acumulado,
    activa: true,
  };

  const cajaDia = cuentas.find(cuenta => cuenta.id === cuentaCajaDiaId) || nuevaCuentaCajaDia(hoy);
  const resto = cuentas.filter(cuenta => !esCajaChica(cuenta) && cuenta.id !== cuentaCajaGrandeId && cuenta.id !== cuentaCajaDiaId);

  return [cajaDia, cajaGrande, ...resto];
};

/** Si quedo saldo de una jornada anterior sin cerrar, lo manda a la caja grande y deja el dia en cero. */
const arrastrarCajaDia = (cuentas: CuentaDinero[], hoy: string): CuentaDinero[] => {
  const cajaDia = cuentas.find(cuenta => cuenta.id === cuentaCajaDiaId);
  if (!cajaDia || cajaDia.saldo_fecha === hoy) return cuentas;

  const arrastre = cajaDia.saldo;
  const siguiente = cuentas.map(cuenta => {
    if (cuenta.id === cuentaCajaDiaId) return { ...cuenta, saldo: 0, saldo_fecha: hoy };
    if (cuenta.id === cuentaCajaGrandeId) return { ...cuenta, saldo: cuenta.saldo + arrastre };
    return cuenta;
  });

  if (arrastre !== 0) {
    const movimiento: MovimientoFinanciero = {
      id: createId('mov-fin'),
      fecha: hoy,
      tipo: 'transferencia',
      origen: 'transferencia_interna',
      cuenta_id: cuentaCajaDiaId,
      cuenta_destino_id: cuentaCajaGrandeId,
      monto: arrastre,
      descripcion: `Cierre automatico: efectivo del ${cajaDia.saldo_fecha || 'dia anterior'} a caja grande`,
      created_at: new Date().toISOString(),
    };
    saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
  }

  return siguiente;
};

export const loadCuentasDinero = () => withStoreTransaction(() => {
  const hoy = todayKey();
  const saved = readStorage<CuentaDinero[]>(cuentasDineroStorageKey, []);
  if (!Array.isArray(saved) || saved.length === 0) {
    writeStorage(cuentasDineroStorageKey, defaultCuentas);
    return defaultCuentas;
  }

  const separadas = separarCajas(saved, hoy);
  const alDia = arrastrarCajaDia(separadas, hoy);
  if (alDia !== saved) writeStorage(cuentasDineroStorageKey, alDia);
  return alDia;
});

export const transferirEntreCuentas = (data: {
  cuenta_origen_id: string;
  cuenta_destino_id: string;
  monto: number;
  descripcion: string;
  fecha?: string;
}) => withStoreTransaction(() => {
  if (data.monto === 0) return;
  if (!Number.isFinite(data.monto) || data.monto <= 0) throw new Error('Ingresá un importe mayor que cero.');
  if (data.cuenta_origen_id === data.cuenta_destino_id) throw new Error('Elegí dos cuentas distintas.');
  const cuentas = loadCuentasDinero();
  const origen = cuentas.find(cuenta => cuenta.id === data.cuenta_origen_id && cuenta.activa);
  const destino = cuentas.find(cuenta => cuenta.id === data.cuenta_destino_id && cuenta.activa);
  if (!origen || !destino) throw new Error('Una de las cuentas no está disponible.');
  const fecha = data.fecha || todayKey();

  saveCuentasDinero(loadCuentasDinero().map(cuenta => {
    if (cuenta.id === data.cuenta_origen_id) return { ...cuenta, saldo: cuenta.saldo - data.monto };
    if (cuenta.id === data.cuenta_destino_id) return { ...cuenta, saldo: cuenta.saldo + data.monto, saldo_fecha: cuenta.saldo_fecha ? fecha : undefined };
    return cuenta;
  }));

  const movimiento: MovimientoFinanciero = {
    id: createId('mov-fin'),
    fecha,
    tipo: 'transferencia',
    origen: 'transferencia_interna',
    cuenta_id: data.cuenta_origen_id,
    cuenta_destino_id: data.cuenta_destino_id,
    monto: data.monto,
    descripcion: data.descripcion,
    created_at: new Date().toISOString(),
  };
  saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
});

/** Pasa el efectivo del mostrador a la caja grande y deja la caja del dia en cero. */
export const cerrarCajaDia = (descripcion = 'Cierre de caja: efectivo del dia a caja grande') => withStoreTransaction(() => {
  const hoy = todayKey();
  const cuentas = loadCuentasDinero();
  const cajaDia = cuentas.find(cuenta => cuenta.id === cuentaCajaDiaId);
  const transferido = cajaDia?.saldo || 0;

  saveCuentasDinero(cuentas.map(cuenta => {
    if (cuenta.id === cuentaCajaDiaId) return { ...cuenta, saldo: 0, saldo_fecha: hoy };
    if (cuenta.id === cuentaCajaGrandeId) return { ...cuenta, saldo: cuenta.saldo + transferido };
    return cuenta;
  }));

  if (transferido !== 0) {
    const movimiento: MovimientoFinanciero = {
      id: createId('mov-fin'),
      fecha: hoy,
      tipo: 'transferencia',
      origen: 'transferencia_interna',
      cuenta_id: cuentaCajaDiaId,
      cuenta_destino_id: cuentaCajaGrandeId,
      monto: transferido,
      descripcion,
      created_at: new Date().toISOString(),
    };
    saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
  }

  return transferido;
});

export const saveCuentasDinero = (cuentas: CuentaDinero[]) => writeStorage(cuentasDineroStorageKey, cuentas);

export const loadMovimientosFinancieros = () =>
  readStorage<MovimientoFinanciero[]>(movimientosFinancierosStorageKey, [])
    .map(movimiento => (movimiento.cuenta_id === cuentaCajaChicaId ? { ...movimiento, cuenta_id: cuentaCajaGrandeId } : movimiento));
export const saveMovimientosFinancieros = (movimientos: MovimientoFinanciero[]) => writeStorage(movimientosFinancierosStorageKey, movimientos);

export const loadFacturasProveedor = () => {
  const saved = readStorage<FacturaProveedor[]>(facturasProveedorStorageKey, []);
  return saved.map(factura => ({ ...factura, estado: getFacturaEstado(factura) }));
};

export const saveFacturasProveedor = (facturas: FacturaProveedor[]) =>
  writeStorage(facturasProveedorStorageKey, facturas.map(factura => ({ ...factura, estado: getFacturaEstado(factura) })));

export const loadPagosProveedor = () => readStorage<PagoProveedor[]>(pagosProveedorStorageKey, []);
export const savePagosProveedor = (pagos: PagoProveedor[]) => writeStorage(pagosProveedorStorageKey, pagos);

export const crearFacturaProveedor = (data: {
  proveedor_id: string;
  compra_id?: string;
  numero?: string;
  fecha: string;
  vencimiento?: string;
  total: number;
  pagado?: number;
  observaciones?: string;
}) => {
  const facturas = loadFacturasProveedor();
  const factura: FacturaProveedor = {
    id: createId('fac'),
    proveedor_id: data.proveedor_id,
    compra_id: data.compra_id,
    numero: data.numero?.trim() || `COMP-${new Date().getTime()}`,
    fecha: data.fecha,
    vencimiento: data.vencimiento || data.fecha,
    total: data.total,
    pagado: data.pagado || 0,
    recargo_por_vencimiento: 0,
    estado: 'pendiente',
    observaciones: data.observaciones,
    created_at: new Date().toISOString(),
  };
  const next = [{ ...factura, estado: getFacturaEstado(factura) }, ...facturas];
  saveFacturasProveedor(next);
  return factura;
};

export const registrarPagoProveedor = (data: {
  proveedor_id: string;
  factura_id?: string;
  cuenta_origen_id: string;
  fecha?: string;
  metodo_pago: MetodoPago;
  monto: number;
  observaciones?: string;
  creado_por?: string;
}) => withStoreTransaction(() => {
  if (!Number.isFinite(data.monto) || data.monto <= 0) throw new Error('Ingresá un pago mayor que cero.');
  if (!loadCuentasDinero().some(cuenta => cuenta.id === data.cuenta_origen_id && cuenta.activa)) throw new Error('Elegí una cuenta de origen válida.');
  if (data.factura_id) {
    const factura = loadFacturasProveedor().find(item => item.id === data.factura_id && item.proveedor_id === data.proveedor_id);
    if (!factura) throw new Error('La factura no corresponde a este proveedor.');
    if (Math.round(data.monto * 100) > Math.round((factura.total - factura.pagado) * 100)) throw new Error('El pago supera el saldo pendiente de la factura.');
  }
  const pago: PagoProveedor = {
    id: createId('pago-prov'),
    proveedor_id: data.proveedor_id,
    factura_id: data.factura_id,
    cuenta_origen_id: data.cuenta_origen_id,
    fecha: data.fecha || todayKey(),
    metodo_pago: data.metodo_pago,
    monto: data.monto,
    observaciones: data.observaciones || '',
    created_at: new Date().toISOString(),
    creado_por: data.creado_por,
  };

  const cuentas = loadCuentasDinero().map(cuenta => (
    cuenta.id === data.cuenta_origen_id ? { ...cuenta, saldo: cuenta.saldo - data.monto } : cuenta
  ));
  saveCuentasDinero(cuentas);

  if (data.factura_id) {
    const facturas = loadFacturasProveedor().map(factura => {
      if (factura.id !== data.factura_id) return factura;
      const updated = { ...factura, pagado: Math.min(factura.total, factura.pagado + data.monto) };
      return { ...updated, estado: getFacturaEstado(updated) };
    });
    saveFacturasProveedor(facturas);
    const factura = facturas.find(item => item.id === data.factura_id);
    const gastos = loadGastos();
    if (factura && gastos.some(gasto => gasto.factura_proveedor_id === factura.id)) {
      saveGastos(gastos.map(gasto => gasto.factura_proveedor_id === factura.id
        ? { ...gasto, monto_pagado: factura.pagado, estado: factura.pagado >= factura.total ? 'pagado' : 'pendiente' }
        : gasto));
    }
  }

  const pagos = [pago, ...loadPagosProveedor()];
  savePagosProveedor(pagos);

  const movimiento: MovimientoFinanciero = {
    id: createId('mov-fin'),
    fecha: pago.fecha,
    tipo: 'salida',
    origen: 'pago_proveedor',
    cuenta_id: data.cuenta_origen_id,
    monto: data.monto,
    descripcion: data.observaciones || 'Pago a proveedor',
    proveedor_id: data.proveedor_id,
    factura_proveedor_id: data.factura_id,
    pago_id: pago.id,
    metodo_pago: data.metodo_pago,
    created_at: pago.created_at,
    creado_por: data.creado_por,
  };
  saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);

  if (data.cuenta_origen_id === cuentaCajaDiaId) aplicarGastoEnCajaDia(pago.fecha, data.monto, 1);
  return pago;
});

/** Registra la compra en Pagos y conserva un solo débito por el importe abonado. */
export const registrarGastoCompra = (data: {
  compra_id: string;
  proveedor_id?: string;
  fecha: string;
  vencimiento?: string;
  comprobante?: string;
  concepto: string;
  observaciones: string;
  total: number;
  monto_pagado: number;
  cuenta_origen_id?: string;
  metodo_pago: MetodoPago;
}) => withStoreTransaction(() => {
  const existente = loadGastos().find(gasto => gasto.compra_id === data.compra_id);
  if (existente) return existente;
  if (!Number.isFinite(data.total) || data.total <= 0) return;
  if (!Number.isFinite(data.monto_pagado) || data.monto_pagado < 0 || data.monto_pagado > data.total) {
    throw new Error('El importe pagado debe estar entre cero y el total de la compra.');
  }
  if (data.monto_pagado > 0 && !loadCuentasDinero().some(cuenta => cuenta.id === data.cuenta_origen_id && cuenta.activa)) {
    throw new Error('Elegí una cuenta de origen para registrar el pago.');
  }
  const factura = data.proveedor_id ? crearFacturaProveedor({
    proveedor_id: data.proveedor_id, compra_id: data.compra_id, numero: data.comprobante,
    fecha: data.fecha, vencimiento: data.vencimiento, total: data.total, observaciones: data.observaciones,
  }) : undefined;
  const gasto: Gasto = {
    id: `gasto-${data.compra_id}`, compra_id: data.compra_id, factura_proveedor_id: factura?.id,
    fecha: data.fecha, concepto: data.concepto, categoria: 'variable', alcance: 'general',
    metodo_pago: data.metodo_pago, monto: data.total, monto_pagado: data.monto_pagado,
    observaciones: data.observaciones, created_at: new Date().toISOString(),
    proveedor_id: data.proveedor_id, comprobante: data.comprobante,
    cuenta_origen_id: data.cuenta_origen_id, vencimiento: data.vencimiento || data.fecha,
    estado: data.monto_pagado >= data.total ? 'pagado' : 'pendiente',
  };
  if (data.monto_pagado > 0 && data.cuenta_origen_id) {
    if (factura && data.proveedor_id) {
      registrarPagoProveedor({
        proveedor_id: data.proveedor_id, factura_id: factura.id, cuenta_origen_id: data.cuenta_origen_id,
        fecha: data.fecha, metodo_pago: data.metodo_pago, monto: data.monto_pagado, observaciones: data.concepto,
      });
    } else {
      registrarSalidaCuenta({
        cuenta_id: data.cuenta_origen_id, monto: data.monto_pagado, descripcion: data.concepto,
        origen: 'gasto', fecha: data.fecha, metodo_pago: data.metodo_pago,
      });
      if (data.cuenta_origen_id === cuentaCajaDiaId) aplicarGastoEnCajaDia(data.fecha, data.monto_pagado, 1);
    }
  }
  saveGastos([gasto, ...loadGastos()]);
  return gasto;
});

export const registrarEntradaCuenta = (data: {
  cuenta_id: string;
  monto: number;
  descripcion: string;
  origen: MovimientoFinanciero['origen'];
  fecha?: string;
}) => withStoreTransaction(() => {
  saveCuentasDinero(loadCuentasDinero().map(cuenta => (
    cuenta.id === data.cuenta_id ? { ...cuenta, saldo: cuenta.saldo + data.monto } : cuenta
  )));
  const movimiento: MovimientoFinanciero = {
    id: createId('mov-fin'),
    fecha: data.fecha || todayKey(),
    tipo: 'entrada',
    origen: data.origen,
    cuenta_id: data.cuenta_id,
    monto: data.monto,
    descripcion: data.descripcion,
    created_at: new Date().toISOString(),
  };
  saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
});

export const registrarSalidaCuenta = (data: {
  cuenta_id: string;
  monto: number;
  descripcion: string;
  origen: MovimientoFinanciero['origen'];
  fecha?: string;
  metodo_pago?: MetodoPago;
  proveedor_id?: string;
  creado_por?: string;
}) => withStoreTransaction(() => {
  saveCuentasDinero(loadCuentasDinero().map(cuenta => (
    cuenta.id === data.cuenta_id ? { ...cuenta, saldo: cuenta.saldo - data.monto } : cuenta
  )));
  const movimiento: MovimientoFinanciero = {
    id: createId('mov-fin'),
    fecha: data.fecha || todayKey(),
    tipo: 'salida',
    origen: data.origen,
    cuenta_id: data.cuenta_id,
    monto: data.monto,
    descripcion: data.descripcion,
    proveedor_id: data.proveedor_id,
    metodo_pago: data.metodo_pago,
    created_at: new Date().toISOString(),
    creado_por: data.creado_por,
  };
  saveMovimientosFinancieros([movimiento, ...loadMovimientosFinancieros()]);
});
