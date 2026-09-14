import type { Ingrediente, ProduccionPreparada, Producto } from './types';

type CostoInsumo = (ingredienteId: string) => number;

export const redondearPrecio = (precio: number) => Math.ceil(precio / 100) * 100;

/** Al cobrar solo se descuenta lo que figura en la receta: sin receta, el producto no mueve stock. */
export const descuentaStock = (producto: Producto) => (producto.receta?.length || 0) > 0;

export const productosSinDescuento = (productos: Producto[]) =>
  productos.filter(producto => producto.activo && !descuentaStock(producto));

const normalizarNombre = (valor: string) =>
  valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Busca el insumo que más se parece al nombre del producto, para proponerlo al vincular. */
export const sugerirInsumoPara = (producto: Producto, ingredientes: Ingrediente[]) => {
  const nombre = normalizarNombre(producto.nombre);
  if (!nombre) return undefined;
  return (
    ingredientes.find(ingrediente => normalizarNombre(ingrediente.nombre) === nombre) ||
    ingredientes.find(ingrediente => {
      const insumo = normalizarNombre(ingrediente.nombre);
      return insumo.startsWith(nombre) || nombre.startsWith(insumo);
    }) ||
    ingredientes.find(ingrediente => {
      const insumo = normalizarNombre(ingrediente.nombre);
      return insumo.includes(nombre) || nombre.includes(insumo);
    })
  );
};

export const margenPorcentaje = (precio: number, costo: number) =>
  precio > 0 ? ((precio - costo) / precio) * 100 : 0;

export const costoUnitarioProduccion = (produccion: ProduccionPreparada, costoInsumo: CostoInsumo) => {
  if (!produccion.receta?.length) return produccion.costo_unitario || 0;
  const rendimiento = produccion.cantidad_producida > 0 ? produccion.cantidad_producida : 1;
  const costoLote = produccion.receta.reduce(
    (sum, item) => sum + item.cantidad * costoInsumo(item.ingrediente_id || ''),
    0,
  );
  return costoLote / rendimiento;
};

export const calcularCostoProducto = (
  producto: Producto,
  costoInsumo: CostoInsumo,
  producciones: ProduccionPreparada[],
) =>
  (producto.receta || []).reduce((sum, item) => {
    if ((item.tipo || 'stock') === 'produccion') {
      const produccion = producciones.find(p => p.id === item.produccion_id) || item.produccion;
      return produccion ? sum + item.cantidad * costoUnitarioProduccion(produccion, costoInsumo) : sum;
    }
    return sum + item.cantidad * costoInsumo(item.ingrediente_id || '');
  }, 0);

// Mantiene el margen que el combo tenía antes del aumento. Si vendía sin margen o
// regalado, al menos traslada el aumento en pesos.
const sugerirPrecio = (precioActual: number, costoAnterior: number, costoNuevo: number, margenAnterior: number) => {
  if (precioActual <= 0) return 0;
  if (margenAnterior > 0 && margenAnterior < 100) return redondearPrecio(costoNuevo / (1 - margenAnterior / 100));
  return redondearPrecio(precioActual + (costoNuevo - costoAnterior));
};

export interface InsumoEncarecido {
  id: string;
  nombre: string;
  unidad: string;
  costoAnterior: number;
  costoNuevo: number;
  variacion: number;
}

export interface ProductoImpactado {
  producto: Producto;
  costoAnterior: number;
  costoNuevo: number;
  margenAnterior: number;
  margenNuevo: number;
  precioSugerido: number;
}

export interface ImpactoCompra {
  insumos: InsumoEncarecido[];
  productos: ProductoImpactado[];
}

export const analizarImpactoCompra = ({
  ingredientes,
  costosNuevos,
  productos,
  producciones,
}: {
  ingredientes: Ingrediente[];
  costosNuevos: Map<string, number>;
  productos: Producto[];
  producciones: ProduccionPreparada[];
}): ImpactoCompra => {
  const porId = new Map(ingredientes.map(ingrediente => [ingrediente.id, ingrediente]));
  const costoAntes: CostoInsumo = id => porId.get(id)?.costo_por_unidad || 0;
  const costoDespues: CostoInsumo = id => costosNuevos.get(id) ?? costoAntes(id);

  const insumos: InsumoEncarecido[] = [];
  costosNuevos.forEach((costoNuevo, id) => {
    const ingrediente = porId.get(id);
    if (!ingrediente) return;
    const costoAnterior = ingrediente.costo_por_unidad;
    if (costoAnterior <= 0 || costoNuevo <= costoAnterior + 0.001) return;
    insumos.push({
      id,
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad_medida,
      costoAnterior,
      costoNuevo,
      variacion: ((costoNuevo - costoAnterior) / costoAnterior) * 100,
    });
  });
  insumos.sort((a, b) => b.variacion - a.variacion);

  const impactados: ProductoImpactado[] = [];
  if (insumos.length) {
    productos.forEach(producto => {
      if (!producto.receta?.length) return;
      const costoAnterior = calcularCostoProducto(producto, costoAntes, producciones);
      const costoNuevo = calcularCostoProducto(producto, costoDespues, producciones);
      if (costoNuevo <= costoAnterior + 0.01) return;
      const margenAnterior = margenPorcentaje(producto.precio_venta, costoAnterior);
      const margenNuevo = margenPorcentaje(producto.precio_venta, costoNuevo);
      impactados.push({
        producto,
        costoAnterior,
        costoNuevo,
        margenAnterior,
        margenNuevo,
        precioSugerido: sugerirPrecio(producto.precio_venta, costoAnterior, costoNuevo, margenAnterior),
      });
    });
    impactados.sort((a, b) => (a.margenNuevo - a.margenAnterior) - (b.margenNuevo - b.margenAnterior));
  }

  return { insumos, productos: impactados };
};
