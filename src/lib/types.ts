export type Rol = 'admin' | 'encargado' | 'cajero' | 'moza' | 'cocina';

export type EstadoMesa =
  | 'libre'
  | 'ocupada'
  | 'esperando_pedido'
  | 'en_preparacion'
  | 'servida'
  | 'pendiente_cobro'
  | 'cerrada';

export type EstadoPedido = 'abierto' | 'en_preparacion' | 'listo' | 'entregado' | 'cobrado' | 'cancelado';
export type EstadoItem = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mixto';
export type TipoComprobante = 'ticket' | 'factura_x' | 'factura_b' | 'factura_a';
export type EstadoCajaDiaria = 'abierta' | 'cerrada';
export type CategoriaGasto = 'sueldo' | 'fijo' | 'variable' | 'extra';
export type AlcanceGasto = 'caja_dia' | 'general';
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';
export type Sector = 'salon' | 'terraza' | 'barra' | 'privado';
export type UnidadMedida = 'gramos' | 'kilos' | 'mililitros' | 'litros' | 'unidad' | 'feta' | 'porcion' | 'paquete';
export type OrigenCompra = 'manual' | 'excel' | 'pdf' | 'foto';
export type ModoCompraItem = 'existente' | 'nuevo';
export type TipoComponenteReceta = 'stock' | 'produccion';
export type TipoCuentaDinero = 'efectivo' | 'banco' | 'billetera_virtual' | 'tarjeta' | 'otra';
export type TipoMovimientoFinanciero = 'entrada' | 'salida' | 'transferencia' | 'ajuste';
export type OrigenMovimientoFinanciero = 'venta' | 'gasto' | 'pago_proveedor' | 'compra' | 'apertura_caja' | 'retiro' | 'transferencia_interna' | 'ajuste';
export type EstadoFacturaProveedor = 'pendiente' | 'por_vencer' | 'vencida' | 'pagada';
export type CondicionPagoCompra = 'pendiente' | 'pagada' | 'parcial';

export interface Profile {
  id: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  activo: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Mesa {
  id: string;
  numero: number;
  nombre?: string;
  capacidad: number;
  estado: EstadoMesa;
  empleado_id?: string;
  sector: Sector;
  posicion_x: number;
  posicion_y: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
  empleado?: Profile;
}

export interface CategoriaProducto {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  orden: number;
  activa: boolean;
  created_at: string;
}

export interface Ingrediente {
  id: string;
  codigo?: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  stock_actual: number;
  stock_minimo: number;
  costo_por_unidad: number;
  proveedor_id?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  proveedor?: Proveedor;
}

export interface Producto {
  id: string;
  codigo?: string;
  nombre: string;
  descripcion: string;
  categoria_id?: string;
  precio_venta: number;
  costo_produccion: number;
  margen_ganancia: number;
  imagen_url?: string;
  disponible: boolean;
  agotado: boolean;
  tiempo_preparacion: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  categoria?: CategoriaProducto;
  receta?: RecetaItem[];
}

export interface ProduccionPreparada {
  id: string;
  nombre: string;
  descripcion: string;
  unidad_medida: UnidadMedida;
  cantidad_producida: number;
  stock_actual: number;
  costo_unitario: number;
  receta: RecetaItem[];
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegistroProduccion {
  id: string;
  produccion_id: string;
  fecha: string;
  cantidad: number;
  cantidad_base: number;
  costo_total: number;
  insumos_utilizados?: Array<{
    ingrediente_id: string;
    cantidad: number;
    costo: number;
  }>;
  responsable?: string;
  observaciones?: string;
  created_at: string;
}

export interface RecetaItem {
  id: string;
  producto_id: string;
  tipo?: TipoComponenteReceta;
  ingrediente_id?: string;
  produccion_id?: string;
  cantidad: number;
  unidad_medida: string;
  costo_calculado: number;
  created_at: string;
  ingrediente?: Ingrediente;
  produccion?: ProduccionPreparada;
}

export interface Pedido {
  id: string;
  mesa_id: string;
  empleado_id?: string;
  cantidad_personas: number;
  estado: EstadoPedido;
  subtotal: number;
  descuento: number;
  recargo: number;
  total: number;
  observaciones: string;
  hora_apertura: string;
  hora_cierre?: string;
  created_at: string;
  updated_at: string;
  mesa?: Mesa;
  empleado?: Profile;
  items?: PedidoItem[];
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  observaciones: string;
  estado: EstadoItem;
  created_at: string;
  updated_at: string;
  producto?: Producto;
}

export interface Pago {
  id: string;
  pedido_id: string;
  cajero_id?: string;
  comprador_nombre?: string;
  tipo_comprobante?: TipoComprobante;
  metodo_pago: MetodoPago;
  monto: number;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_debito: number;
  monto_credito: number;
  descuento_aplicado: number;
  recargo_aplicado: number;
  total_cobrado: number;
  vuelto: number;
  created_at: string;
  pedido?: Pedido;
  cajero?: Profile;
}

export interface CajaDiaria {
  id: string;
  fecha: string;
  cajero_id?: string;
  cajero_nombre?: string;
  monto_inicial: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  total_ventas: number;
  monto_esperado_efectivo: number;
  monto_cierre_efectivo?: number;
  diferencia_efectivo?: number;
  estado: EstadoCajaDiaria;
  opened_at: string;
  closed_at?: string;
}

export interface Gasto {
  id: string;
  fecha: string;
  concepto: string;
  categoria: CategoriaGasto;
  alcance: AlcanceGasto;
  metodo_pago: MetodoPago;
  monto: number;
  observaciones: string;
  created_at: string;
  creado_por?: string;
  cuenta_origen_id?: string;
  pagos_divididos?: Array<{
    metodo_pago: MetodoPago;
    cuenta_id: string;
    monto: number;
  }>;
  proveedor_id?: string;
  comprobante?: string;
  estado?: 'pendiente' | 'pagado' | 'vencido';
  vencimiento?: string;
  recurrente?: boolean;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  cuit?: string;
  direccion?: string;
  codigo_fiscal?: string;
  activo: boolean;
  created_at: string;
}

export interface Compra {
  id: string;
  proveedor_id?: string;
  empleado_id?: string;
  fecha: string;
  total: number;
  observaciones: string;
  created_at: string;
  proveedor?: Proveedor;
  empleado?: Profile;
}

export interface CompraItemDraft {
  id: string;
  modo: ModoCompraItem;
  ingrediente_id?: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  cantidad: number;
  costo_unitario: number;
  proveedor_id?: string;
  stock_minimo: number;
  observaciones?: string;
  confianza?: number;
}

export interface CompraDraft {
  id: string;
  origen: OrigenCompra;
  proveedor_id?: string;
  fecha: string;
  comprobante_nombre?: string;
  total: number;
  observaciones: string;
  items: CompraItemDraft[];
  condicion_pago?: CondicionPagoCompra;
  cuenta_origen_id?: string;
  monto_pagado?: number;
  vencimiento?: string;
}

export interface MovimientoStock {
  id: string;
  ingrediente_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string;
  compra_id?: string;
  pedido_id?: string;
  empleado_id?: string;
  stock_anterior: number;
  stock_nuevo: number;
  created_at: string;
  ingrediente?: Ingrediente;
}

export interface CuentaDinero {
  id: string;
  nombre: string;
  tipo: TipoCuentaDinero;
  saldo: number;
  activa: boolean;
  created_at: string;
  /** Día al que corresponde el saldo. Solo lo usa la caja del día, que arranca en cero cada jornada. */
  saldo_fecha?: string;
}

export interface MovimientoFinanciero {
  id: string;
  fecha: string;
  tipo: TipoMovimientoFinanciero;
  origen: OrigenMovimientoFinanciero;
  cuenta_id?: string;
  cuenta_destino_id?: string;
  monto: number;
  descripcion: string;
  proveedor_id?: string;
  factura_proveedor_id?: string;
  compra_id?: string;
  pago_id?: string;
  metodo_pago?: MetodoPago;
  created_at: string;
  creado_por?: string;
}

export interface FacturaProveedor {
  id: string;
  proveedor_id: string;
  compra_id?: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  total: number;
  pagado: number;
  recargo_por_vencimiento: number;
  estado: EstadoFacturaProveedor;
  observaciones?: string;
  created_at: string;
}

export interface PagoProveedor {
  id: string;
  proveedor_id: string;
  factura_id?: string;
  cuenta_origen_id: string;
  fecha: string;
  metodo_pago: MetodoPago;
  monto: number;
  observaciones: string;
  created_at: string;
  creado_por?: string;
}

export type PageId =
  | 'dashboard'
  | 'mesas'
  | 'pedidos'
  | 'cocina'
  | 'caja'
  | 'caja_dia'
  | 'caja_arqueos'
  | 'cobros'
  | 'ventas'
  | 'productos'
  | 'combos'
  | 'lista_precios'
  | 'stock'
  | 'stock_insumos'
  | 'stock_consumos'
  | 'stock_produccion'
  | 'proveedores'
  | 'gastos'
  | 'costos'
  | 'reportes'
  | 'usuarios'
  | 'configuracion';
