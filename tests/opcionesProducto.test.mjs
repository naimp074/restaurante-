import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Opciones al pedir un producto: "combo con café o té", "sándwich solo con mayonesa".
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/opcionesProducto';
  export * from './src/lib/pedidosExternos';
  export * from './src/lib/demoStore';
  export * from './src/lib/storeSync';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' } });
const mod = new Module(path.resolve('tests/opcionesProducto.compiled.cjs'));
mod.filename = path.resolve('tests/opcionesProducto.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const bebida = { id: 'g-beb', nombre: 'Bebida', obligatorio: true, maximo: 1, opciones: [
  { id: 'o-cafe', nombre: 'Café', precio_extra: 0 },
  { id: 'o-te', nombre: 'Té', precio_extra: 0 },
  { id: 'o-jugo', nombre: 'Jugo', precio_extra: 800 },
] };
const aderezos = { id: 'g-ad', nombre: 'Aderezo', obligatorio: false, maximo: 2, opciones: [
  { id: 'o-mayo', nombre: 'Mayonesa', precio_extra: 0 },
  { id: 'o-ket', nombre: 'Ketchup', precio_extra: 0 },
  { id: 'o-mos', nombre: 'Mostaza', precio_extra: 0 },
] };
const combo = { id: 'prod-combo', nombre: 'Combo desayuno', precio_venta: 6000, disponible: true, agotado: false, receta: [], grupos_opciones: [bebida, aderezos] };

let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  } });
  api.resetStoreWriteMarks();
});

test('en un grupo de "elegí una" la segunda opción reemplaza a la primera', () => {
  let sel = api.alternarOpcion(bebida, {}, 'o-cafe');
  sel = api.alternarOpcion(bebida, sel, 'o-te');
  assert.deepEqual(sel['g-beb'], ['o-te']);
});

test('no deja pasar del máximo del grupo', () => {
  let sel = {};
  for (const id of ['o-mayo', 'o-ket', 'o-mos']) sel = api.alternarOpcion(aderezos, sel, id);
  assert.deepEqual(sel['g-ad'], ['o-mayo', 'o-ket']);
});

test('avisa qué grupo obligatorio falta y suma el extra al precio', () => {
  assert.deepEqual(api.gruposFaltantes(combo, {}), ['Bebida']);
  const elegidas = api.opcionesElegidas(combo, { 'g-beb': ['o-jugo'], 'g-ad': ['o-mayo'] });
  assert.equal(api.precioConOpciones(combo.precio_venta, elegidas), 6800);
  assert.equal(api.textoOpciones(elegidas), 'Bebida: Jugo · Aderezo: Mayonesa');
});

test('dos combos con distinta bebida no se juntan en la misma línea', () => {
  const cafe = [{ grupo: 'Bebida', opcion: 'Café', precio_extra: 0 }];
  const te = [{ grupo: 'Bebida', opcion: 'Té', precio_extra: 0 }];
  const item = { producto_id: combo.id, opciones: cafe, observaciones: '' };
  assert.equal(api.salenIgual(item, combo.id, cafe, ''), true);
  assert.equal(api.salenIgual(item, combo.id, te, ''), false);
  assert.equal(api.salenIgual(item, combo.id, cafe, 'solo mayonesa'), false);
});

test('limpiarGrupos saca opciones vacías, grupos sin opciones y ajusta el máximo', () => {
  const limpios = api.limpiarGrupos([
    { id: 'a', nombre: ' Bebida ', obligatorio: true, maximo: 5, opciones: [{ id: '1', nombre: 'Café', precio_extra: -3 }, { id: '2', nombre: '  ', precio_extra: 0 }] },
    { id: 'b', nombre: 'Vacío', obligatorio: false, maximo: 1, opciones: [{ id: '3', nombre: '', precio_extra: 0 }] },
  ]);
  assert.equal(limpios.length, 1);
  assert.equal(limpios[0].nombre, 'Bebida');
  assert.equal(limpios[0].maximo, 1);
  assert.deepEqual(limpios[0].opciones, [{ id: '1', nombre: 'Café', precio_extra: 0 }]);
});

test('el pedido para llevar guarda lo elegido y cobra el extra', () => {
  const pedido = api.crearPedidoLocal({
    canal: 'mostrador', cliente_nombre: 'Ana', cliente_telefono: '', direccion_entrega: '', costo_envio: 0, observaciones: '',
    lineas: [
      { id: 'l1', producto: combo, cantidad: 2, observaciones: 'sin azúcar', opciones: [{ grupo: 'Bebida', opcion: 'Jugo', precio_extra: 800 }] },
      { id: 'l2', producto: combo, cantidad: 1, observaciones: '', opciones: [{ grupo: 'Bebida', opcion: 'Té', precio_extra: 0 }] },
    ],
  });
  assert.equal(pedido.items.length, 2);
  assert.equal(pedido.items[0].precio_unitario, 6800);
  assert.equal(pedido.items[0].subtotal, 13600);
  assert.equal(pedido.items[0].observaciones, 'sin azúcar');
  assert.deepEqual(pedido.items[1].opciones, [{ grupo: 'Bebida', opcion: 'Té', precio_extra: 0 }]);
  assert.equal(pedido.total, 19600);
});
