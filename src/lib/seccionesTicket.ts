import type { PedidoItem, Producto, SeccionTicket } from './types';
import { seccionCartaRestaurante } from './cartaRestaurante';

export const nombresSeccion: Record<SeccionTicket, string> = {
  entrada: 'Entradas',
  principal: 'Platos principales',
  otro: 'Otros',
};

const orden: SeccionTicket[] = ['entrada', 'principal', 'otro'];

/**
 * La sección de un producto: la que tiene cargada, si no la del catálogo actual
 * (los pedidos viejos guardan una copia sin este dato) y si no la de la carta del restaurante.
 */
export const seccionDelProducto = (productoId: string, producto?: Producto, catalogo: Producto[] = []): SeccionTicket =>
  producto?.seccion_ticket
  ?? catalogo.find(p => p.id === productoId)?.seccion_ticket
  ?? seccionCartaRestaurante(productoId)
  ?? 'otro';

export interface GrupoTicket<T> {
  /** Null cuando no hay nada que separar: el ticket sale como siempre, sin títulos. */
  titulo: string | null;
  items: T[];
}

/** Separa entradas, platos principales y el resto, en ese orden y sin cambiar el orden dentro de cada uno. */
export const agruparPorSeccion = <T extends Pick<PedidoItem, 'producto_id' | 'producto'>>(items: T[], catalogo: Producto[] = []): GrupoTicket<T>[] => {
  const porSeccion = new Map<SeccionTicket, T[]>(orden.map(s => [s, []]));
  items.forEach(item => porSeccion.get(seccionDelProducto(item.producto_id, item.producto, catalogo))!.push(item));
  const conItems = orden.filter(s => porSeccion.get(s)!.length > 0);
  if (conItems.length === 0) return [];
  if (conItems.length === 1 && conItems[0] === 'otro') return [{ titulo: null, items }];
  return conItems.map(s => ({ titulo: nombresSeccion[s], items: porSeccion.get(s)! }));
};

/** Arma los renglones del ticket con un título por sección. */
export const htmlItemsPorSeccion = <T extends Pick<PedidoItem, 'producto_id' | 'producto'>>(
  items: T[],
  renglon: (item: T) => string,
  catalogo: Producto[] = [],
) => agruparPorSeccion(items, catalogo)
  .map(grupo => `${grupo.titulo ? `<div class="seccion">${grupo.titulo}</div>` : ''}${grupo.items.map(renglon).join('')}`)
  .join('');

/** Estilo del título de sección, para sumar al CSS de cada ticket. */
export const estiloSeccionTicket = '.seccion { font-size: 12px; font-weight: 800; text-transform: uppercase; margin: 8px 0 3px; border-bottom: 1px solid #111827; }';
