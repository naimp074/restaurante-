import type { CategoriaProducto, PedidoItem, Producto } from './types';

export type LineaCategoria = { nombre: string; subtotal: number };

const aCentavos = (monto: number) => Math.round(monto * 100);

/**
 * El comprobante fiscal muestra lo consumido por categoría, sin productos. Los importes se
 * reparten para que sumen justo el total facturado, con descuentos, recargos o envío incluidos.
 */
export const lineasPorCategoria = (
  items: PedidoItem[],
  total: number,
  catalogo: Producto[],
  categorias: CategoriaProducto[],
): LineaCategoria[] => {
  const sumas = new Map<string, number>();
  items
    .filter(item => item.estado !== 'cancelado')
    .forEach(item => {
      const categoriaId = catalogo.find(p => p.id === item.producto_id)?.categoria_id ?? item.producto?.categoria_id;
      const nombre = categorias.find(c => c.id === categoriaId)?.nombre || 'Consumo';
      sumas.set(nombre, (sumas.get(nombre) || 0) + aCentavos(item.subtotal));
    });

  const consumido = [...sumas.values()].reduce((suma, monto) => suma + monto, 0);
  if (consumido <= 0) return [];

  const totalCentavos = aCentavos(total);
  let asignado = 0;
  const entradas = [...sumas.entries()];
  return entradas.map(([nombre, monto], indice) => {
    const centavos = indice === entradas.length - 1
      ? totalCentavos - asignado
      : Math.round((monto / consumido) * totalCentavos);
    asignado += centavos;
    return { nombre, subtotal: centavos / 100 };
  });
};
