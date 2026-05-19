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
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';
export type Sector = 'salon' | 'terraza' | 'barra' | 'privado';
export type UnidadMedida = 'gramos' | 'kilos' | 'mililitros' | 'litros' | 'unidad' | 'feta' | 'porcion' | 'paquete';

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

export interface RecetaItem {
  id: string;
  producto_id: string;
  ingrediente_id: string;
  cantidad: number;
  unidad_medida: string;
  costo_calculado: number;
  created_at: string;
  ingrediente?: Ingrediente;
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

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
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

export type PageId =
  | 'dashboard'
  | 'mesas'
  | 'pedidos'
  | 'cocina'
  | 'caja'
  | 'productos'
  | 'stock'
  | 'costos'
  | 'reportes'
  | 'usuarios'
  | 'configuracion';
