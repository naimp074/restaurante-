import { estadoVisualMesa, minutosAbierta, pedidoAbiertoDeMesa } from '../../lib/estadoMesa';
import { etiquetaMesa } from '../../lib/planoMesas';
import type { Mesa, Pedido, PlanoMesa } from '../../lib/types';
import type { MesaEnPlano } from './PlanoInteractivo';

export const nombreDeMesa = (mesa: Pick<Mesa, 'numero' | 'nombre'>) => mesa.nombre?.trim() || `Mesa ${mesa.numero}`;

/** Lo que el plano necesita de cada mesa, sacado del mismo estado que usa el resto del sistema. */
export const armarMesaEnPlano = (mesa: Mesa, layout: PlanoMesa, pedidos: Pedido[], ahora: number): MesaEnPlano => {
  const estado = estadoVisualMesa(mesa, pedidos);
  const pedido = estado === 'libre' || estado === 'cerrada' ? undefined : pedidoAbiertoDeMesa(mesa.id, pedidos);
  return {
    id: mesa.id,
    layout,
    etiqueta: etiquetaMesa(mesa),
    nombreCompleto: nombreDeMesa(mesa),
    capacidad: mesa.capacidad,
    estado,
    minutos: pedido ? minutosAbierta(pedido, ahora) : undefined,
  };
};
