import type { Producto } from './types';
import { categoriasIniciales } from './mockData';

const categoriasViejas = new Set(Array.from({ length: 14 }, (_, indice) => `cat-${indice + 1}`));
const cafeteria = categoriasIniciales.find(categoria => categoria.id === 's-cafeteria');

const esVieja = (producto: Producto) => categoriasViejas.has(producto.categoria_id || '');

export const tieneCategoriasViejas = (productos: Producto[]) => productos.some(esVieja);

/** Toda la carta va a S-CAFETERÍA: S-BAR y S-RESTAURANTE quedan vacías para cargarlas después. */
export const pasarATresCategorias = (productos: Producto[], ahora = new Date().toISOString()): Producto[] =>
  productos.map(producto => (esVieja(producto)
    ? { ...producto, categoria_id: cafeteria?.id, categoria: cafeteria, updated_at: ahora }
    : producto));
