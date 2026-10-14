import type { CanalPedido, Pedido } from './types';

/** Los pedidos guardados antes de existir los canales son todos de salón. */
export const canalDe = (pedido?: Pick<Pedido, 'canal'> | null): CanalPedido => pedido?.canal || 'salon';

export const esDeSalon = (pedido: Pedido) => canalDe(pedido) === 'salon';

/** Lo pagado en la app de PedidosYa no se cobra en la caja: lo liquida PedidosYa. */
export const cobraEnCaja = (pedido: Pedido) => pedido.cobro !== 'plataforma';

export const nombresCanal: Record<CanalPedido, string> = {
  salon: 'Salón',
  mostrador: 'Para llevar',
  delivery: 'Delivery',
  pedidosya: 'PedidosYa',
};

/** Cómo se nombra el pedido en caja, cocina y tickets. */
export const etiquetaPedido = (pedido?: Pedido | null): string => {
  if (!pedido) return 'Pedido';
  const canal = canalDe(pedido);
  if (canal === 'salon') {
    if (!pedido.mesa) return 'Mesa';
    return pedido.mesa.nombre || `Mesa ${pedido.mesa.numero}`;
  }
  if (canal === 'pedidosya') {
    const codigo = pedido.externo?.codigo_corto || pedido.externo?.codigo || '';
    return `PedidosYa${codigo ? ` #${codigo}` : ''}${pedido.cliente_nombre ? ` · ${pedido.cliente_nombre}` : ''}`;
  }
  return `${nombresCanal[canal]}${pedido.cliente_nombre ? ` · ${pedido.cliente_nombre}` : ''}`;
};
