import type {
  CuentaDinero,
  EstadoFacturaProveedor,
  FacturaProveedor,
  MetodoPago,
  MovimientoFinanciero,
  PagoProveedor,
} from './types';

export const cuentasDineroStorageKey = 'restaurant-cuentas-dinero';
export const movimientosFinancierosStorageKey = 'restaurant-movimientos-financieros';
export const facturasProveedorStorageKey = 'restaurant-facturas-proveedor';
export const pagosProveedorStorageKey = 'restaurant-pagos-proveedor';

const todayKey = () => new Date().toISOString().slice(0, 10);
const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultCuentas: CuentaDinero[] = [
  { id: 'cuenta-caja-grande', nombre: 'Caja grande', tipo: 'efectivo', saldo: 0, activa: true, created_at: new Date().toISOString() },
  { id: 'cuenta-caja-chica', nombre: 'Caja chica', tipo: 'efectivo', saldo: 0, activa: true, created_at: new Date().toISOString() },
  { id: 'cuenta-banco', nombre: 'Banco', tipo: 'banco', saldo: 0, activa: true, created_at: new Date().toISOString() },
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
  window.localStorage.setItem(key, JSON.stringify(value));
};

const getFacturaEstado = (factura: Pick<FacturaProveedor, 'total' | 'pagado' | 'vencimiento'>): EstadoFacturaProveedor => {
  if (factura.pagado >= factura.total) return 'pagada';
  const diff = Math.ceil((new Date(`${factura.vencimiento}T00:00:00`).getTime() - new Date().getTime()) / 86400000);
  if (diff < 0) return 'vencida';
  if (diff <= 3) return 'por_vencer';
  return 'pendiente';
};

export const loadCuentasDinero = () => {
  const saved = readStorage<CuentaDinero[]>(cuentasDineroStorageKey, []);
  if (!Array.isArray(saved) || saved.length === 0) {
    writeStorage(cuentasDineroStorageKey, defaultCuentas);
    return defaultCuentas;
  }
  return saved;
};

export const saveCuentasDinero = (cuentas: CuentaDinero[]) => writeStorage(cuentasDineroStorageKey, cuentas);

export const loadMovimientosFinancieros = () => readStorage<MovimientoFinanciero[]>(movimientosFinancierosStorageKey, []);
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
}) => {
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

  return pago;
};

export const registrarEntradaCuenta = (data: {
  cuenta_id: string;
  monto: number;
  descripcion: string;
  origen: MovimientoFinanciero['origen'];
  fecha?: string;
}) => {
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
};

export const registrarSalidaCuenta = (data: {
  cuenta_id: string;
  monto: number;
  descripcion: string;
  origen: MovimientoFinanciero['origen'];
  fecha?: string;
  metodo_pago?: MetodoPago;
  proveedor_id?: string;
  creado_por?: string;
}) => {
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
};
