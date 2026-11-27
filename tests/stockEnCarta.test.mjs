import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// "Vender en carta" desde Stock: el producto aparece en la carta y cada venta cobrada descuenta el insumo.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/stockEnCarta'; export { descontarStockPorVenta, reponerStockPorVenta } from './src/lib/ventasStock';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/stockEnCarta.compiled.cjs'));
mod.filename = path.resolve('tests/stockEnCarta.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const put = (key, value) => storage.set(`restaurant-${key}`, JSON.stringify(value));
const get = key => JSON.parse(storage.get(`restaurant-${key}`) || '[]');
const coca = { id: 'ing-coca', nombre: 'Coca-Cola 500 cc', unidad_medida: 'unidad', stock_actual: 2, stock_minimo: 6, costo_por_unidad: 1500, activo: true, created_at: '', updated_at: '' };
const stockCoca = () => get('demo-ingredientes').find(i => i.id === 'ing-coca').stock_actual;
const vender = (producto, cantidad) => ({
  id: `p-${Math.random()}`, estado: 'cobrado', mesa: { numero: 3 },
  items: [{ id: 'i1', producto_id: producto.id, producto, cantidad, precio_unitario: producto.precio_venta, subtotal: cantidad * producto.precio_venta, estado: 'entregado' }],
});

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  put('demo-ingredientes', [coca]);
  put('categorias', [{ id: 's-restaurante', nombre: 'S-RESTAURANTE' }, { id: 's-cafeteria', nombre: 'S-CAFETERÍA' }]);
  put('productos', [
    { id: 'prod-coca-resto', nombre: 'Coca-Cola 500 cc', categoria_id: 's-restaurante', precio_venta: 4000, costo_produccion: 0, margen_ganancia: 0, activo: true, disponible: true, agotado: false, receta: [] },
    { id: 'prod-mila', nombre: 'Milanesa', categoria_id: 's-restaurante', precio_venta: 22000, costo_produccion: 0, margen_ganancia: 0, activo: true, disponible: true, agotado: false,
      receta: [{ id: 'r1', producto_id: 'prod-mila', tipo: 'stock', ingrediente_id: 'ing-carne', cantidad: 0.2, unidad_medida: 'kg', costo_calculado: 1000, created_at: '' }] },
  ]);
});

test('producto nuevo: queda en la carta, a la venta y con receta de 1 unidad', () => {
  const p = api.crearProductoDesdeInsumo({ insumo: coca, nombre: 'Coca-Cola 500 cc', categoria_id: 's-cafeteria', precio: 4000, cantidad: 1 });
  const guardado = get('productos').find(x => x.id === p.id);
  assert.equal(guardado.categoria_id, 's-cafeteria');
  assert.equal(guardado.disponible, true);
  assert.equal(guardado.activo, true);
  assert.equal(guardado.precio_venta, 4000);
  assert.deepEqual(guardado.receta.map(r => [r.ingrediente_id, r.cantidad]), [['ing-coca', 1]]);
  assert.deepEqual(api.productosDelInsumo('ing-coca', get('productos')).map(x => x.id), [p.id]);
});

test('no repite un producto con el mismo nombre en la misma categoría', () => {
  assert.throws(() => api.crearProductoDesdeInsumo({ insumo: coca, nombre: 'coca-cola 500 cc', categoria_id: 's-restaurante', precio: 4000, cantidad: 1 }), /Unir a uno que ya está/);
  assert.throws(() => api.crearProductoDesdeInsumo({ insumo: coca, nombre: 'X', categoria_id: 's-cafeteria', precio: 0, cantidad: 1 }), /precio/);
});

test('unir a uno que ya está: Cafetería y Restaurante descuentan del mismo stock, y se puede vender sin stock', () => {
  const resto = api.unirInsumoAProducto({ insumo: coca, productoId: 'prod-coca-resto', cantidad: 1 });
  assert.equal(resto.precio_venta, 4000);
  const cafe = api.crearProductoDesdeInsumo({ insumo: coca, nombre: 'Coca-Cola 500 cc', categoria_id: 's-cafeteria', precio: 4000, cantidad: 1 });
  assert.equal(api.productosDelInsumo('ing-coca', get('productos')).length, 2);

  api.descontarStockPorVenta(vender(get('productos').find(x => x.id === 'prod-coca-resto'), 1));
  api.descontarStockPorVenta(vender(get('productos').find(x => x.id === cafe.id), 3));
  // Había 2: se vendieron 4. No frena la venta, el stock queda en negativo para que se note.
  assert.equal(stockCoca(), -2);
});

test('unir no pisa la receta que ya tiene ni la repite; quitar la deja como estaba', () => {
  api.unirInsumoAProducto({ insumo: coca, productoId: 'prod-mila', cantidad: 1 });
  api.unirInsumoAProducto({ insumo: coca, productoId: 'prod-mila', cantidad: 2 });
  let mila = get('productos').find(x => x.id === 'prod-mila');
  assert.deepEqual(mila.receta.map(r => [r.ingrediente_id, r.cantidad]), [['ing-carne', 0.2], ['ing-coca', 2]]);
  api.desunirInsumoDeProducto('ing-coca', 'prod-mila');
  mila = get('productos').find(x => x.id === 'prod-mila');
  assert.deepEqual(mila.receta.map(r => r.ingrediente_id), ['ing-carne']);
});
