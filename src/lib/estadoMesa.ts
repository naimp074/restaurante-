import type { EstadoMesa, EstadoPedido, Mesa, Pedido } from './types';
import { cobroEnCurso, itemSinEnviar } from './cobroComanda';

/**
 * El estado que se ve de cada mesa sale de su comanda, no de lo guardado en la mesa:
 * así el plano, Comandas y el Dashboard muestran lo mismo aunque se abran en distintas tablets.
 *
 *  sin comanda abierta                    -> libre (o cerrada si está fuera de servicio)
 *  comanda sin productos                  -> ocupada
 *  productos cargados sin mandar a cocina -> esperando_pedido
 *  cocina lo tiene (o ya está listo)      -> en_preparacion
 *  todo entregado                         -> servida
 *  pidió la cuenta o hay cobro en caja    -> pendiente_cobro
 */
const pedidosCerrados: EstadoPedido[] = ['cobrado', 'cuenta_corriente', 'cancelado'];

export const pedidoAbiertoDeMesa = (mesaId: string, pedidos: Pedido[]) =>
  mesaId ? pedidos.find(pedido => pedido.mesa_id === mesaId && !pedidosCerrados.includes(pedido.estado)) : undefined;

export const estadoDePedido = (pedido: Pedido): Exclude<EstadoMesa, 'libre' | 'cerrada'> => {
  if (pedido.cuenta_pedida_at || cobroEnCurso(pedido)) return 'pendiente_cobro';
  const items = (pedido.items || []).filter(item => item.estado !== 'cancelado');
  if (items.length === 0) return 'ocupada';
  if (pedido.estado === 'abierto') return 'esperando_pedido';
  const sinEnviar = items.some(item => itemSinEnviar(item, pedido));
  const enCocina = items.some(item => item.estado === 'pendiente' && !itemSinEnviar(item, pedido));
  if (items.some(item => item.estado === 'en_preparacion' || item.estado === 'listo')) return 'en_preparacion';
  if (enCocina && (pedido.estado === 'en_preparacion' || pedido.estado === 'listo')) return 'en_preparacion';
  // Entregado, pero cargaron algo más que todavía no mandaron a cocina.
  if (sinEnviar || enCocina) return 'esperando_pedido';
  return 'servida';
};

export const estadoVisualMesa = (mesa: Mesa, pedidos: Pedido[]): EstadoMesa => {
  if (mesa.estado === 'cerrada') return 'cerrada';
  const pedido = pedidoAbiertoDeMesa(mesa.id, pedidos);
  return pedido ? estadoDePedido(pedido) : 'libre';
};

/** Aclaración corta que no cambia el color: "Listo para servir", "3 sin enviar"... */
export const detalleDePedido = (pedido: Pedido): string | undefined => {
  const items = (pedido.items || []).filter(item => item.estado !== 'cancelado');
  const listos = items.filter(item => item.estado === 'listo').length;
  if (listos) return listos === 1 ? '1 plato listo para servir' : `${listos} platos listos para servir`;
  const sinEnviar = items.filter(item => itemSinEnviar(item, pedido)).length;
  if (sinEnviar) return sinEnviar === 1 ? '1 producto sin enviar a cocina' : `${sinEnviar} productos sin enviar a cocina`;
  return undefined;
};

export const minutosAbierta = (pedido: Pedido, ahora = Date.now()) => {
  const desde = Date.parse(pedido.hora_apertura || pedido.created_at);
  return Number.isFinite(desde) ? Math.max(0, Math.floor((ahora - desde) / 60000)) : 0;
};

export const textoDuracion = (minutos: number) =>
  minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;

export type ColoresEstado = { relleno: string; borde: string; texto: string };

export const estadoMesaConfig: Record<EstadoMesa, { label: string; colores: ColoresEstado; color: string; dot: string; bg: string }> = {
  libre: {
    label: 'Libre',
    colores: { relleno: '#dcfce7', borde: '#22c55e', texto: '#14532d' },
    color: 'text-emerald-700', dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200',
  },
  ocupada: {
    label: 'Ocupada',
    colores: { relleno: '#dbeafe', borde: '#3b82f6', texto: '#1e3a8a' },
    color: 'text-blue-700', dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-300',
  },
  esperando_pedido: {
    label: 'Esperando pedido',
    colores: { relleno: '#fef9c3', borde: '#eab308', texto: '#713f12' },
    color: 'text-yellow-700', dot: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-300',
  },
  en_preparacion: {
    label: 'En preparación',
    colores: { relleno: '#ffedd5', borde: '#f97316', texto: '#7c2d12' },
    color: 'text-orange-700', dot: 'bg-orange-500', bg: 'bg-orange-50 border-orange-300',
  },
  servida: {
    label: 'Pedido servido',
    colores: { relleno: '#ede9fe', borde: '#8b5cf6', texto: '#4c1d95' },
    color: 'text-violet-700', dot: 'bg-violet-500', bg: 'bg-violet-50 border-violet-300',
  },
  pendiente_cobro: {
    label: 'Pendiente de cobro',
    colores: { relleno: '#fee2e2', borde: '#ef4444', texto: '#7f1d1d' },
    color: 'text-red-700', dot: 'bg-red-500', bg: 'bg-red-50 border-red-300',
  },
  cerrada: {
    label: 'Cerrada',
    colores: { relleno: '#f1f5f9', borde: '#94a3b8', texto: '#475569' },
    color: 'text-slate-600', dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200',
  },
};
