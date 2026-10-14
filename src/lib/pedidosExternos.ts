import type { CuentaDinero, EstadoPlataforma, Pedido, PedidoItem, Producto } from './types';
import { loadDemoPedidos, saveDemoPedidos } from './demoStore';
import { loadCuentasDinero, registrarEntradaCuenta, saveCuentasDinero } from './finance';
import { nuevoId } from './ids';
import { withStoreTransaction } from './storeSync';
import { supabase } from './supabase';
import { descontarStockPorVenta } from './ventasStock';
import { etiquetaPedido } from './pedidosCanal';

/** Lo que PedidosYa debe liquidar. Al cobrar, se pasa a Banco con un traspaso (Gastos → Traspasos). */
export const cuentaPedidosYaId = 'cuenta-pedidosya';

const cerrados: Pedido['estado'][] = ['cobrado', 'cuenta_corriente', 'cancelado'];
export const pedidoAbierto = (pedido: Pedido) => !cerrados.includes(pedido.estado);

const redondear = (n: number) => Math.round(n * 100) / 100;

const actualizarPedido = (pedidoId: string, cambiar: (pedido: Pedido) => Pedido) => {
  const pedidos = loadDemoPedidos();
  const actual = pedidos.find(p => p.id === pedidoId);
  if (!actual) throw new Error('El pedido ya no existe.');
  const nuevo = { ...cambiar(actual), updated_at: new Date().toISOString() };
  saveDemoPedidos(pedidos.map(p => (p.id === pedidoId ? nuevo : p)));
  return nuevo;
};

// ---------- Para llevar y delivery propio ----------

export type LineaNueva = { producto: Producto; cantidad: number; observaciones: string };

export type DatosPedidoLocal = {
  canal: 'mostrador' | 'delivery';
  cliente_nombre: string;
  cliente_telefono: string;
  direccion_entrega: string;
  costo_envio: number;
  observaciones: string;
  empleado_id?: string;
  lineas: LineaNueva[];
};

/** Crea el pedido y lo manda directo a cocina. Se cobra en Caja → Cobros, como una mesa. */
export const crearPedidoLocal = (datos: DatosPedidoLocal): Pedido => {
  const lineas = datos.lineas.filter(l => l.cantidad > 0);
  if (!lineas.length) throw new Error('Agregá al menos un producto.');
  if (datos.canal === 'delivery' && !datos.direccion_entrega.trim()) throw new Error('Falta la dirección de entrega.');
  const envio = datos.canal === 'delivery' ? Math.max(0, Number(datos.costo_envio) || 0) : 0;

  const ahora = new Date().toISOString();
  const id = nuevoId('ped');
  const items: PedidoItem[] = lineas.map(linea => ({
    id: nuevoId('item'),
    pedido_id: id,
    producto_id: linea.producto.id,
    cantidad: linea.cantidad,
    precio_unitario: linea.producto.precio_venta,
    subtotal: redondear(linea.producto.precio_venta * linea.cantidad),
    observaciones: linea.observaciones.trim(),
    estado: 'pendiente',
    created_at: ahora,
    updated_at: ahora,
    producto: linea.producto,
  }));
  // El envío va en el subtotal para que Caja lo cobre sin pasos extra.
  const subtotal = redondear(items.reduce((s, i) => s + i.subtotal, 0) + envio);

  const pedido: Pedido = {
    id,
    mesa_id: '',
    canal: datos.canal,
    empleado_id: datos.empleado_id,
    cantidad_personas: 1,
    estado: 'en_preparacion',
    subtotal,
    descuento: 0,
    recargo: 0,
    total: subtotal,
    observaciones: datos.observaciones.trim(),
    cliente_nombre: datos.cliente_nombre.trim(),
    cliente_telefono: datos.cliente_telefono.trim(),
    direccion_entrega: datos.canal === 'delivery' ? datos.direccion_entrega.trim() : '',
    costo_envio: envio,
    cobro: 'caja',
    hora_apertura: ahora,
    created_at: ahora,
    updated_at: ahora,
    items,
  };
  saveDemoPedidos([...loadDemoPedidos(), pedido]);
  return pedido;
};

export const cancelarPedido = (pedidoId: string, motivo: string) => actualizarPedido(pedidoId, pedido => {
  if (!pedidoAbierto(pedido)) throw new Error('El pedido ya está cerrado.');
  return {
    ...pedido,
    estado: 'cancelado',
    hora_cierre: new Date().toISOString(),
    observaciones: [pedido.observaciones, motivo ? `Cancelado: ${motivo}` : 'Cancelado'].filter(Boolean).join(' · '),
  };
});

/** Para llevar / delivery propio: el cliente o el repartidor ya se lo llevó. */
export const marcarEntregado = (pedidoId: string) => actualizarPedido(pedidoId, pedido => ({
  ...pedido,
  estado: pedido.estado === 'cobrado' ? pedido.estado : 'entregado',
  items: (pedido.items || []).map(item => (item.estado === 'cancelado' ? item : { ...item, estado: 'entregado' })),
}));

// ---------- PedidosYa ----------

/** Refleja en el pedido lo que se le avisó a PedidosYa. */
export const aplicarEstadoPlataforma = (pedidoId: string, estado: EstadoPlataforma) => actualizarPedido(pedidoId, pedido => {
  if (!pedido.externo) return pedido;
  const externo = { ...pedido.externo, estado_plataforma: estado };
  if (estado === 'aceptado') return { ...pedido, externo, estado: pedido.estado === 'abierto' ? 'en_preparacion' : pedido.estado };
  if (estado === 'rechazado') return { ...pedido, externo, estado: 'cancelado', hora_cierre: new Date().toISOString() };
  return { ...pedido, externo };
});

const asegurarCuentaPedidosYa = () => {
  const cuentas = loadCuentasDinero();
  if (cuentas.some(c => c.id === cuentaPedidosYaId)) return;
  const cuenta: CuentaDinero = {
    id: cuentaPedidosYaId,
    nombre: 'PedidosYa (a cobrar)',
    tipo: 'otra',
    saldo: 0,
    activa: true,
    created_at: new Date().toISOString(),
  };
  saveCuentasDinero([...cuentas, cuenta]);
};

export const netoPedidosYa = (total: number, comision: number) =>
  redondear(total * (1 - Math.min(99, Math.max(0, comision)) / 100));

/**
 * Cierra un pedido pagado en la app: descuenta stock y deja el importe (menos la
 * comisión) como saldo a cobrar de PedidosYa. No toca la caja del día.
 */
export const finalizarPedidoPlataforma = (pedidoId: string, comision: number) => withStoreTransaction(() => {
  const pedido = loadDemoPedidos().find(p => p.id === pedidoId);
  if (!pedido) throw new Error('El pedido ya no existe.');
  if (pedido.cobro !== 'plataforma') throw new Error('Este pedido se cobra en Caja.');
  if (!pedidoAbierto(pedido)) throw new Error('El pedido ya está cerrado.');
  const estadoPlataforma = pedido.externo?.estado_plataforma;
  if (estadoPlataforma === 'pendiente') throw new Error('Primero aceptá el pedido.');
  if (estadoPlataforma === 'cancelado' || estadoPlataforma === 'rechazado') throw new Error('El pedido fue cancelado.');

  const ahora = new Date().toISOString();
  const cerrado = actualizarPedido(pedidoId, actual => ({
    ...actual,
    estado: 'cobrado',
    hora_cierre: ahora,
    items: (actual.items || []).map(item => (item.estado === 'cancelado' ? item : { ...item, estado: 'entregado' })),
  }));
  descontarStockPorVenta(cerrado);

  const neto = netoPedidosYa(cerrado.total, comision);
  asegurarCuentaPedidosYa();
  registrarEntradaCuenta({
    cuenta_id: cuentaPedidosYaId,
    monto: neto,
    origen: 'venta',
    descripcion: `${etiquetaPedido(cerrado)} · total $${cerrado.total.toLocaleString('es-AR')}`
      + (comision > 0 ? ` − comisión ${comision}% ($${redondear(cerrado.total - neto).toLocaleString('es-AR')})` : ''),
  });
  return cerrado;
});

export type AccionPedidosYa = 'aceptar' | 'rechazar' | 'listo' | 'retirado';

/** Pide a la función del servidor que avise a PedidosYa; si sale bien, actualiza el pedido acá. */
export const avisarAPedidosYa = async (
  pedidoId: string,
  accion: AccionPedidosYa,
  opciones: { minutos?: number; motivo?: string } = {},
): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: 'PedidosYa necesita la conexión con Supabase.' };
  const { data, error } = await supabase.functions.invoke('pedidosya/accion', {
    body: { pedido_id: pedidoId, accion, ...opciones },
  });
  if (error) {
    let mensaje = error.message;
    try {
      const cuerpo = await (error as { context?: Response }).context?.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Sin cuerpo legible: queda el mensaje genérico.
    }
    return { ok: false, error: mensaje };
  }
  const estados: Record<AccionPedidosYa, EstadoPlataforma> = { aceptar: 'aceptado', rechazar: 'rechazado', listo: 'listo', retirado: 'retirado' };
  aplicarEstadoPlataforma(pedidoId, estados[accion]);
  return { ok: true, aviso: (data as { aviso?: string } | null)?.aviso };
};

// ---------- Configuración ----------

export type ConfigPedidosYa = { remote_id: string; comision: number; activo: boolean };

export const urlFuncionPedidosYa = () => {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  return base ? `${base}/functions/v1/pedidosya` : '';
};

export const cargarConfigPedidosYa = async (): Promise<ConfigPedidosYa | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('pedidosya_locales').select('remote_id, comision, activo').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { remote_id: data.remote_id, comision: Number(data.comision) || 0, activo: Boolean(data.activo) } : null;
};

export const guardarConfigPedidosYa = async (localId: string, config: ConfigPedidosYa, remoteIdAnterior?: string) => {
  if (!supabase) throw new Error('Necesitás la conexión con Supabase.');
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(config.remote_id)) {
    throw new Error('El código del local debe tener entre 3 y 64 letras, números, guiones o puntos, sin espacios.');
  }
  const fila = { local_id: localId, remote_id: config.remote_id, comision: config.comision, activo: config.activo, updated_at: new Date().toISOString() };
  const { error } = remoteIdAnterior
    ? await supabase.from('pedidosya_locales').update(fila).eq('remote_id', remoteIdAnterior)
    : await supabase.from('pedidosya_locales').insert(fila);
  if (error) throw new Error(error.message);
};
