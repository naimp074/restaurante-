import type { CategoriaProducto, Ingrediente, Producto, RecetaItem } from './types';
import { loadProductos, saveProductos } from './productosStore';
import { loadCategorias } from './categoriasStore';
import { margenPorcentaje } from './costosReceta';
import { nuevoId } from './ids';

/*
 * "Vender en carta" desde Stock: para lo que se vende tal cual entra (gaseosas, cervezas, vinos, alfajores).
 * Crea el producto en Cartas, o lo une a uno que ya existe, con una receta que descuenta ese insumo.
 * Así cada venta cobrada baja el stock (ver ventasStock.ts). No frena ventas si el stock está en cero.
 */

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Los productos de la carta que descuentan este insumo. */
export const productosDelInsumo = (insumoId: string, productos: Producto[]) =>
  productos.filter(producto => (producto.receta || []).some(item => (item.tipo || 'stock') === 'stock' && item.ingrediente_id === insumoId));

/** Cuánto descuenta del insumo cada venta de ese producto. */
export const cantidadPorVenta = (producto: Producto, insumoId: string) =>
  (producto.receta || []).find(item => (item.tipo || 'stock') === 'stock' && item.ingrediente_id === insumoId)?.cantidad || 0;

const componente = (producto_id: string, insumo: Ingrediente, cantidad: number, ahora: string): RecetaItem => ({
  id: nuevoId('rec'),
  producto_id,
  tipo: 'stock',
  ingrediente_id: insumo.id,
  cantidad,
  unidad_medida: insumo.unidad_medida,
  costo_calculado: redondear((insumo.costo_por_unidad || 0) * cantidad),
  created_at: ahora,
});

const validarCantidad = (cantidad: number) => {
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Poné cuánto descuenta del stock cada venta (por ejemplo 1).');
};

/** Crea un producto nuevo en Cartas que descuenta este insumo. Devuelve el producto. */
export const crearProductoDesdeInsumo = (datos: {
  insumo: Ingrediente;
  nombre: string;
  categoria_id: string;
  precio: number;
  cantidad: number;
}): Producto => {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('Escribí el nombre con el que sale en la carta.');
  const categoria: CategoriaProducto | undefined = loadCategorias().find(c => c.id === datos.categoria_id);
  if (!categoria) throw new Error('Elegí la categoría de la carta.');
  if (!Number.isFinite(datos.precio) || datos.precio <= 0) throw new Error('Poné el precio de venta.');
  validarCantidad(datos.cantidad);
  const actuales = loadProductos();
  const repetido = actuales.find(p => p.categoria_id === categoria.id && p.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (repetido) throw new Error(`"${repetido.nombre}" ya está en ${categoria.nombre}: elegí "Unir a uno que ya está".`);

  const ahora = new Date().toISOString();
  const id = nuevoId('prod');
  const receta = [componente(id, datos.insumo, datos.cantidad, ahora)];
  const costo = receta[0].costo_calculado;
  const producto: Producto = {
    id,
    codigo: `PROD-${Date.now().toString().slice(-6)}`,
    nombre,
    descripcion: '',
    categoria_id: categoria.id,
    categoria,
    precio_venta: datos.precio,
    costo_produccion: costo,
    margen_ganancia: margenPorcentaje(datos.precio, costo),
    disponible: true,
    agotado: false,
    tiempo_preparacion: 0,
    activo: true,
    created_at: ahora,
    updated_at: ahora,
    receta,
  };
  saveProductos([producto, ...actuales]);
  return producto;
};

/**
 * Une el insumo a un producto que ya está en la carta: le agrega a la receta que descuente ese insumo
 * (o le cambia la cantidad si ya lo descontaba). No toca el precio ni el resto de la receta.
 */
export const unirInsumoAProducto = (datos: { insumo: Ingrediente; productoId: string; cantidad: number }): Producto => {
  validarCantidad(datos.cantidad);
  const actuales = loadProductos();
  const producto = actuales.find(p => p.id === datos.productoId);
  if (!producto) throw new Error('Ese producto ya no está en la carta.');
  const ahora = new Date().toISOString();
  const receta = producto.receta || [];
  const yaEsta = receta.some(item => (item.tipo || 'stock') === 'stock' && item.ingrediente_id === datos.insumo.id);
  const nuevaReceta = yaEsta
    ? receta.map(item => ((item.tipo || 'stock') === 'stock' && item.ingrediente_id === datos.insumo.id
      ? { ...item, cantidad: datos.cantidad, costo_calculado: redondear((datos.insumo.costo_por_unidad || 0) * datos.cantidad) }
      : item))
    : [...receta, componente(producto.id, datos.insumo, datos.cantidad, ahora)];
  const costo = redondear(nuevaReceta.reduce((suma, item) => suma + (item.costo_calculado || 0), 0));
  const actualizado: Producto = {
    ...producto,
    receta: nuevaReceta,
    costo_produccion: costo,
    margen_ganancia: margenPorcentaje(producto.precio_venta, costo),
    updated_at: ahora,
  };
  saveProductos(actuales.map(p => (p.id === producto.id ? actualizado : p)));
  return actualizado;
};

/** Deja de descontar este insumo al vender ese producto. El producto sigue en la carta. */
export const desunirInsumoDeProducto = (insumoId: string, productoId: string) => {
  const actuales = loadProductos();
  const producto = actuales.find(p => p.id === productoId);
  if (!producto) return;
  const receta = (producto.receta || []).filter(item => !((item.tipo || 'stock') === 'stock' && item.ingrediente_id === insumoId));
  const costo = redondear(receta.reduce((suma, item) => suma + (item.costo_calculado || 0), 0));
  saveProductos(actuales.map(p => (p.id === productoId
    ? { ...p, receta, costo_produccion: costo, margen_ganancia: margenPorcentaje(p.precio_venta, costo), updated_at: new Date().toISOString() }
    : p)));
};
