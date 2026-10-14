/**
 * Traduce un pedido de PedidosYa (formato "Order" de la POS Plugin API de Delivery Hero)
 * al formato de pedido que usa BurgerPOS. Sin dependencias: se usa igual en Deno (la
 * función de Supabase) y en las pruebas de Node.
 *
 * Referencia: https://integration-middleware.stg.restaurant-partners.com/apidocs/pos-plugin-api
 */

export type OrdenPedidosYa = {
  token: string;
  code: string;
  shortCode?: string | null;
  createdAt?: string;
  expiryDate?: string;
  expeditionType?: string;
  test?: boolean;
  comments?: { customerComment?: string | null } | null;
  customer?: { firstName?: string | null; lastName?: string | null; mobilePhone?: string | null } | null;
  delivery?: {
    address?: { street?: string | null; number?: string | null; city?: string | null; postcode?: string | null } | null;
    expectedDeliveryTime?: string | null;
    riderPickupTime?: string | null;
  } | null;
  pickup?: { pickupTime?: string | null } | null;
  payment?: { status?: string | null; type?: string | null } | null;
  price?: { grandTotal?: string | null; payRestaurant?: string | null; collectFromCustomer?: string | null } | null;
  products?: ProductoPedidosYa[];
  callbackUrls?: Partial<Record<
    'orderAcceptedUrl' | 'orderRejectedUrl' | 'orderPickedUpUrl' | 'orderPreparedUrl',
    string | null
  >> | null;
};

type ProductoPedidosYa = {
  id?: string | null;
  remoteCode?: string | null;
  name?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | null;
  paidPrice?: string | null;
  comment?: string | null;
  selectedToppings?: { name?: string | null; quantity?: string | number | null; children?: unknown[] }[] | null;
};

/** Lo mínimo del catálogo de BurgerPOS que hace falta para reconocer los productos. */
export type ProductoCatalogo = { id: string; codigo?: string; nombre: string; precio_venta?: number; receta?: unknown[] };

export type TipoEntrega = 'retiro' | 'delivery_plataforma' | 'delivery_local';
export type EstadoPlataforma = 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'listo' | 'retirado';

export type PedidoMapeado = {
  id: string;
  mesa_id: string;
  canal: 'pedidosya';
  cantidad_personas: number;
  estado: 'abierto' | 'en_preparacion' | 'cancelado';
  subtotal: number;
  descuento: number;
  recargo: number;
  total: number;
  observaciones: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion_entrega: string;
  cobro: 'caja' | 'plataforma';
  hora_apertura: string;
  created_at: string;
  updated_at: string;
  items: {
    id: string;
    pedido_id: string;
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    observaciones: string;
    estado: 'pendiente';
    created_at: string;
    updated_at: string;
    producto: ProductoCatalogo;
  }[];
  externo: {
    plataforma: 'pedidosya';
    token: string;
    codigo: string;
    codigo_corto: string;
    tipo_entrega: TipoEntrega;
    pagado_online: boolean;
    estado_plataforma: EstadoPlataforma;
    vence_at: string;
    entrega_estimada: string;
    total_plataforma: number;
    prueba: boolean;
    sin_reconocer: string[];
    acciones: { aceptar: boolean; rechazar: boolean; listo: boolean; retirado: boolean };
  };
};

/** PedidosYa manda los importes como texto ("25.50"). */
export const numero = (valor: unknown): number => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== 'string' || !valor.trim()) return 0;
  const n = Number(valor.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const redondear = (n: number) => Math.round(n * 100) / 100;

/** El id del pedido sale del token: si PedidosYa reintenta, no se duplica. */
export const idPedidoDesdeToken = (token: string) => `ped-pya-${token}`;

export const tipoEntrega = (orden: OrdenPedidosYa): TipoEntrega => {
  if ((orden.expeditionType || '').toLowerCase().includes('pickup')) return 'retiro';
  // Con riderPickupTime lo lleva un repartidor de PedidosYa; sin él, el repartidor es del local.
  return orden.delivery?.riderPickupTime ? 'delivery_plataforma' : 'delivery_local';
};

/**
 * Busca el producto en el catálogo: primero por el código externo que se cargó en
 * PedidosYa (remoteCode = código o id en BurgerPOS), después por nombre.
 */
export const reconocerProducto = (producto: ProductoPedidosYa, catalogo: ProductoCatalogo[]) => {
  const codigo = (producto.remoteCode || '').trim();
  if (codigo) {
    const porCodigo = catalogo.find(p => p.codigo === codigo || p.id === codigo);
    if (porCodigo) return porCodigo;
  }
  const nombre = normalizar(producto.name || '');
  if (!nombre) return undefined;
  return catalogo.find(p => normalizar(p.nombre) === nombre);
};

const describirAgregados = (producto: ProductoPedidosYa) =>
  (producto.selectedToppings || [])
    .map(t => {
      const cantidad = Math.max(1, Math.round(numero(t.quantity)) || 1);
      return t.name ? `${cantidad > 1 ? `${cantidad}x ` : ''}${t.name}` : '';
    })
    .filter(Boolean)
    .join(', ');

export const mapearPedido = (orden: OrdenPedidosYa, catalogo: ProductoCatalogo[], ahora = new Date().toISOString()): PedidoMapeado => {
  const id = idPedidoDesdeToken(orden.token);
  const sinReconocer: string[] = [];

  const items = (orden.products || []).map((producto, indice) => {
    const cantidad = Math.max(1, Math.round(numero(producto.quantity)) || 1);
    const pagado = numero(producto.paidPrice);
    const unitario = numero(producto.unitPrice) || (pagado ? pagado / cantidad : 0);
    const subtotal = redondear(pagado || unitario * cantidad);
    const enCatalogo = reconocerProducto(producto, catalogo);
    const nombre = producto.name?.trim() || 'Producto sin nombre';
    if (!enCatalogo) sinReconocer.push(nombre);
    const notas = [describirAgregados(producto), producto.comment?.trim() || ''].filter(Boolean).join(' · ');
    return {
      id: `${id}-item-${indice + 1}`,
      pedido_id: id,
      // Sin coincidencia queda como producto suelto: se ve y se cobra, pero no descuenta stock.
      producto_id: enCatalogo?.id || `pya-${producto.remoteCode || producto.id || indice + 1}`,
      cantidad,
      precio_unitario: redondear(unitario),
      subtotal,
      observaciones: notas,
      estado: 'pendiente' as const,
      created_at: ahora,
      updated_at: ahora,
      producto: enCatalogo || { id: `pya-${producto.remoteCode || producto.id || indice + 1}`, nombre },
    };
  });

  const entrega = tipoEntrega(orden);
  const pagadoOnline = (orden.payment?.status || '').toLowerCase() === 'paid';
  const totalPlataforma = redondear(numero(orden.price?.grandTotal) || items.reduce((s, i) => s + i.subtotal, 0));
  // Repartidor de PedidosYa y pago pendiente: el repartidor le entrega al local "payRestaurant".
  const aCobrarAlRepartidor = !pagadoOnline && entrega === 'delivery_plataforma' ? numero(orden.price?.payRestaurant) : 0;
  const total = aCobrarAlRepartidor > 0 ? redondear(aCobrarAlRepartidor) : totalPlataforma;

  const urls = orden.callbackUrls || {};
  // Integración indirecta: el pedido ya se aceptó en la tablet de PedidosYa y no hay URL de aceptación.
  const requiereAceptar = Boolean(urls.orderAcceptedUrl);
  const direccion = orden.delivery?.address;
  const comentario = orden.comments?.customerComment?.trim() || '';

  return {
    id,
    mesa_id: '',
    canal: 'pedidosya',
    cantidad_personas: 1,
    estado: requiereAceptar ? 'abierto' : 'en_preparacion',
    // Caja cobra "subtotal − descuento + recargo": el subtotal ya es lo que cobra PedidosYa
    // (con envío, cargos y promociones incluidos), así no se cobra de más ni de menos.
    subtotal: total,
    descuento: 0,
    recargo: 0,
    total,
    observaciones: [comentario, aCobrarAlRepartidor > 0 ? `Cobrar al repartidor: $${total}` : ''].filter(Boolean).join(' · '),
    cliente_nombre: [orden.customer?.firstName, orden.customer?.lastName].filter(Boolean).join(' ').trim() || 'Cliente PedidosYa',
    cliente_telefono: orden.customer?.mobilePhone || '',
    direccion_entrega: direccion
      ? [[direccion.street, direccion.number].filter(Boolean).join(' '), direccion.city].filter(Boolean).join(', ')
      : '',
    cobro: pagadoOnline ? 'plataforma' : 'caja',
    hora_apertura: orden.createdAt || ahora,
    created_at: orden.createdAt || ahora,
    updated_at: ahora,
    items,
    externo: {
      plataforma: 'pedidosya',
      token: orden.token,
      codigo: orden.code,
      codigo_corto: orden.shortCode || '',
      tipo_entrega: entrega,
      pagado_online: pagadoOnline,
      estado_plataforma: requiereAceptar ? 'pendiente' : 'aceptado',
      vence_at: orden.expiryDate || '',
      entrega_estimada: orden.delivery?.expectedDeliveryTime || orden.pickup?.pickupTime || orden.delivery?.riderPickupTime || '',
      total_plataforma: totalPlataforma,
      prueba: Boolean(orden.test),
      sin_reconocer: sinReconocer,
      acciones: {
        aceptar: requiereAceptar,
        rechazar: Boolean(urls.orderRejectedUrl),
        listo: Boolean(urls.orderPreparedUrl),
        retirado: Boolean(urls.orderPickedUpUrl),
      },
    },
  };
};

/** Validación rápida antes de guardar: PedidosYa pide responder en pocos segundos. */
export const validarOrden = (cuerpo: unknown): cuerpo is OrdenPedidosYa => {
  if (!cuerpo || typeof cuerpo !== 'object') return false;
  const orden = cuerpo as OrdenPedidosYa;
  return typeof orden.token === 'string' && orden.token.length > 0
    && typeof orden.code === 'string'
    && Array.isArray(orden.products) && orden.products.length > 0;
};

/**
 * Hora estimada para aceptar. PedidosYa exige que sea al menos 2 minutos posterior al
 * envío; se respeta la hora que ya prometió la app si existe.
 */
export const horaDeAceptacion = (orden: OrdenPedidosYa, minutos: number, ahora = Date.now()) => {
  const minimo = ahora + 3 * 60_000;
  const prometida = Date.parse(orden.pickup?.pickupTime || orden.delivery?.expectedDeliveryTime || '');
  const pedida = ahora + Math.max(5, minutos) * 60_000;
  const elegida = Number.isFinite(prometida) && minutos <= 0 ? prometida : pedida;
  return new Date(Math.max(elegida, minimo)).toISOString();
};

export const motivosRechazo = [
  'TOO_BUSY',
  'ITEM_UNAVAILABLE',
  'CLOSED',
  'OUTSIDE_DELIVERY_AREA',
  'NO_COURIER',
  'ADDRESS_INCOMPLETE_MISSTATED',
  'MENU_ACCOUNT_SETTINGS',
  'TECHNICAL_PROBLEM',
  'TEST_ORDER',
] as const;
