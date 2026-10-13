import type { Ingrediente, ProduccionPreparada, Producto, RecetaItem } from './types';
import { nuevoId } from './ids';

type CostoInsumo = (ingredienteId: string) => number;

export const redondearPrecio = (precio: number) => {
  if (precio <= 0) return 0;
  return Math.ceil((Math.round(precio * 100) / 100) / 100) * 100;
};

/** Al cobrar solo se descuenta lo que figura en la receta: sin receta, el producto no mueve stock. */
export const descuentaStock = (producto: Producto) => (producto.receta?.length || 0) > 0;

export const productosSinDescuento = (productos: Producto[]) =>
  productos.filter(producto => producto.activo && !descuentaStock(producto));

/** Combo de un solo insumo, para venderlo suelto y descontar stock. */
export const comboDelInsumo = (productos: Producto[], ingredienteId: string) =>
  productos.find(producto =>
    producto.activo &&
    (producto.receta || []).length === 1 &&
    (producto.receta?.[0].tipo || 'stock') === 'stock' &&
    producto.receta?.[0].ingrediente_id === ingredienteId,
  );

export const crearComboDesdeInsumo = (
  ingrediente: Ingrediente,
  {
    nombre,
    precioVenta,
    cantidad = 1,
    existente,
  }: {
    nombre?: string;
    precioVenta: number;
    cantidad?: number;
    existente?: Producto;
  },
): Producto => {
  const ahora = new Date().toISOString();
  const id = existente?.id || nuevoId('prod');
  const porcion = cantidad > 0 ? cantidad : 1;
  const costo = porcion * (ingrediente.costo_por_unidad || 0);
  const receta: RecetaItem[] = [{
    id: existente?.receta?.[0]?.id || nuevoId('rec'),
    producto_id: id,
    tipo: 'stock',
    ingrediente_id: ingrediente.id,
    cantidad: porcion,
    unidad_medida: ingrediente.unidad_medida,
    costo_calculado: costo,
    created_at: existente?.receta?.[0]?.created_at || ahora,
    ingrediente,
  }];
  return {
    id,
    codigo: existente?.codigo || `COMBO-${Date.now().toString().slice(-5)}`,
    nombre: (nombre || ingrediente.nombre).trim() || ingrediente.nombre,
    descripcion: existente?.descripcion || `Venta de ${ingrediente.nombre}`,
    categoria_id: existente?.categoria_id || 'cat-6',
    precio_venta: precioVenta,
    costo_produccion: costo,
    margen_ganancia: margenPorcentaje(precioVenta, costo),
    imagen_url: existente?.imagen_url,
    disponible: existente?.disponible ?? true,
    agotado: existente?.agotado ?? false,
    tiempo_preparacion: existente?.tiempo_preparacion || 5,
    activo: true,
    created_at: existente?.created_at || ahora,
    updated_at: ahora,
    categoria: existente?.categoria,
    receta,
  };
};

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

/** Recargo sobre el costo: costo 100 y venta 200 = 100%. */
export const margenPorcentaje = (precio: number, costo: number) =>
  costo > 0 ? ((precio - costo) / costo) * 100 : 0;

export const precioPorMargen = (costo: number, margenDeseado: number) => {
  if (costo <= 0 || !Number.isFinite(margenDeseado) || margenDeseado <= 0) return 0;
  return redondearPrecio(costo * (1 + margenDeseado / 100));
};

export const costoUnitarioProduccion = (produccion: ProduccionPreparada, costoInsumo: CostoInsumo) => {
  if (!produccion.receta?.length) return produccion.costo_unitario || 0;
  const rendimiento = produccion.cantidad_producida > 0 ? produccion.cantidad_producida : 1;
  const costoLote = produccion.receta.reduce(
    (sum, item) => sum + item.cantidad * costoInsumo(item.ingrediente_id || ''),
    0,
  );
  return costoLote / rendimiento;
};

const costoItemReceta = (item: RecetaItem, costoInsumo: CostoInsumo, producciones: ProduccionPreparada[]) => {
  if ((item.tipo || 'stock') === 'produccion') {
    const produccion = producciones.find(p => p.id === item.produccion_id) || item.produccion;
    return produccion ? item.cantidad * costoUnitarioProduccion(produccion, costoInsumo) : 0;
  }
  return item.cantidad * costoInsumo(item.ingrediente_id || '');
};

export const calcularCostoProducto = (
  producto: Producto,
  costoInsumo: CostoInsumo,
  producciones: ProduccionPreparada[],
) =>
  (producto.receta || []).reduce((sum, item) => sum + costoItemReceta(item, costoInsumo, producciones), 0);

const margenParaPrecio = (producto: Producto, costoAnterior: number) => {
  if (producto.margen_ideal && producto.margen_ideal > 0) {
    return producto.margen_ideal;
  }
  return margenPorcentaje(producto.precio_venta, costoAnterior);
};

// Mantiene el recargo sobre el costo que el combo tenía antes del aumento. Si vendía
// sin margen o regalado, al menos traslada el aumento en pesos.
const sugerirPrecio = (precioActual: number, costoAnterior: number, costoNuevo: number, margenAnterior: number) => {
  if (precioActual <= 0) return 0;
  if (margenAnterior > 0) return precioPorMargen(costoNuevo, margenAnterior);
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

const mapaCostos = (ingredientes: Ingrediente[]) =>
  new Map(ingredientes.map(item => [item.id, item.costo_por_unidad]));

/** Recalcula el costo unitario de las preparaciones cuando cambia un insumo. */
export const actualizarCostosProducciones = (producciones: ProduccionPreparada[], ingredientes: Ingrediente[]) => {
  const costos = mapaCostos(ingredientes);
  const costoInsumo: CostoInsumo = id => costos.get(id) || 0;
  return producciones.map(produccion => {
    const receta = (produccion.receta || []).map(item => {
      const costo_calculado = item.cantidad * costoInsumo(item.ingrediente_id || '');
      return Math.abs(costo_calculado - (item.costo_calculado || 0)) < 0.000001
        ? item
        : { ...item, costo_calculado };
    });
    const costo = costoUnitarioProduccion({ ...produccion, receta }, costoInsumo);
    const recetaCambio = receta.some((item, index) => item !== (produccion.receta || [])[index]);
    if (!recetaCambio && Math.abs(costo - (produccion.costo_unitario || 0)) < 0.000001) return produccion;
    return { ...produccion, receta, costo_unitario: costo, updated_at: new Date().toISOString() };
  });
};

/** Actualiza el costo y el margen ante aumentos o bajas, sin cambiar el precio de venta. */
export const actualizarCostosProductos = (productos: Producto[], ingredientes: Ingrediente[], producciones: ProduccionPreparada[]) => {
  const costos = mapaCostos(ingredientes);
  const costoInsumo: CostoInsumo = id => costos.get(id) || 0;
  return productos.map(producto => {
    if (!producto.receta?.length) return producto;
    const receta = producto.receta.map(item => {
      const costo_calculado = costoItemReceta(item, costoInsumo, producciones);
      return Math.abs(costo_calculado - (item.costo_calculado || 0)) < 0.000001
        ? item
        : { ...item, costo_calculado };
    });
    const costo = receta.reduce((sum, item) => sum + item.costo_calculado, 0);
    const recetaCambio = receta.some((item, index) => item !== producto.receta![index]);
    if (!recetaCambio && Math.abs(costo - producto.costo_produccion) < 0.000001) return producto;
    return {
      ...producto,
      receta,
      costo_produccion: costo,
      margen_ganancia: margenPorcentaje(producto.precio_venta, costo),
      updated_at: new Date().toISOString(),
    };
  });
};

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

export const combosConPrecioNuevo = (impacto: ImpactoCompra) =>
  impacto.productos.filter(item => item.precioSugerido > 0 && Math.abs(item.precioSugerido - item.producto.precio_venta) >= 0.01);

export const aplicarPreciosSugeridos = (productos: Producto[], impacto: ImpactoCompra) => {
  const ajustes = new Map(combosConPrecioNuevo(impacto).map(item => [item.producto.id, item]));
  if (!ajustes.size) return productos;
  return productos.map(producto => {
    const ajuste = ajustes.get(producto.id);
    if (!ajuste) return producto;
    return {
      ...producto,
      precio_venta: ajuste.precioSugerido,
      costo_produccion: ajuste.costoNuevo,
      margen_ganancia: margenPorcentaje(ajuste.precioSugerido, ajuste.costoNuevo),
      updated_at: new Date().toISOString(),
    };
  });
};

export const revertirPreciosVenta = (productos: Producto[], impacto: ImpactoCompra) => {
  const ajustes = new Map(combosConPrecioNuevo(impacto).map(item => [item.producto.id, item]));
  if (!ajustes.size) return productos;
  return productos.map(producto => {
    const ajuste = ajustes.get(producto.id);
    if (!ajuste) return producto;
    const precioVenta = ajuste.producto.precio_venta;
    return {
      ...producto,
      precio_venta: precioVenta,
      costo_produccion: ajuste.costoNuevo,
      margen_ganancia: margenPorcentaje(precioVenta, ajuste.costoNuevo),
      updated_at: new Date().toISOString(),
    };
  });
};

export const detectarCambiosCosto = (
  ingredientes: Ingrediente[],
  costosNuevos: Map<string, number>,
): InsumoEncarecido[] => {
  const porId = new Map(ingredientes.map(ingrediente => [ingrediente.id, ingrediente]));
  const insumos: InsumoEncarecido[] = [];
  costosNuevos.forEach((costoNuevo, id) => {
    const ingrediente = porId.get(id);
    if (!ingrediente) return;
    const costoAnterior = ingrediente.costo_por_unidad;
    if (costoAnterior <= 0 || Math.abs(costoNuevo - costoAnterior) < 0.001) return;
    insumos.push({
      id,
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad_medida,
      costoAnterior,
      costoNuevo,
      variacion: ((costoNuevo - costoAnterior) / costoAnterior) * 100,
    });
  });
  insumos.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
  return insumos;
};

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
  const insumos = detectarCambiosCosto(ingredientes, costosNuevos);

  const impactados: ProductoImpactado[] = [];
  if (insumos.length) {
    productos.forEach(producto => {
      if (!producto.receta?.length) return;
      const costoAnterior = calcularCostoProducto(producto, costoAntes, producciones);
      const costoNuevo = calcularCostoProducto(producto, costoDespues, producciones);
      if (Math.abs(costoNuevo - costoAnterior) < 0.01) return;
      const margenAnterior = margenPorcentaje(producto.precio_venta, costoAnterior);
      const margenObjetivo = margenParaPrecio(producto, costoAnterior);
      const precioSugerido = costoNuevo > costoAnterior
        ? sugerirPrecio(producto.precio_venta, costoAnterior, costoNuevo, margenObjetivo)
        : producto.precio_venta;
      impactados.push({
        producto,
        costoAnterior,
        costoNuevo,
        margenAnterior,
        margenNuevo: margenPorcentaje(precioSugerido || producto.precio_venta, costoNuevo),
        precioSugerido,
      });
    });
    impactados.sort((a, b) => (a.margenNuevo - a.margenAnterior) - (b.margenNuevo - b.margenAnterior));
  }

  return { insumos, productos: impactados };
};
