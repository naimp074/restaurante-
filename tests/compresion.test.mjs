import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Lo pesado se guarda comprimido para que el celular no se quede sin lugar.
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/compresion';
  export * from './src/lib/storeSync';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('tests/compresion.compiled.cjs'));
mod.filename = path.resolve('tests/compresion.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
let cupo;
beforeEach(() => {
  storage = new Map();
  cupo = Infinity;
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => {
      const total = [...storage].reduce((s, [kk, vv]) => s + (kk === k ? 0 : vv.length), 0) + String(v).length;
      if (total > cupo) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      storage.set(k, String(v));
    },
    removeItem: k => storage.delete(k),
  } });
  api.resetStoreWriteMarks();
});

const comandas = n => Array.from({ length: n }, (_, i) => ({
  id: `ped-${i}-${Math.random().toString(36).slice(2)}`, estado: i % 3 ? 'cobrado' : 'abierto', mesa: { numero: i % 80, nombre: `Mesa ${i % 80}` },
  items: [{ producto: { nombre: 'Milanesa napolitana (1 porción)' }, cantidad: 1 + (i % 3), observaciones: i % 5 ? '' : 'sin sal, ñ y 🍕' }], total: i * 1000,
}));

test('comprime y descomprime sin perder nada (acentos, ñ, emojis)', () => {
  for (const texto of ['', 'a', 'aaaaaaaaaaaa', 'abababab', 'Pérez · ñandú · 🍕 · €', JSON.stringify(comandas(500))]) {
    const z = api.comprimir(texto);
    assert.equal(api.descomprimir(z), texto);
    assert.ok(![...z].some(c => c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff), 'sin surrogates sueltos');
  }
});

test('las comandas pesadas se guardan comprimidas y se leen igual', () => {
  const lista = comandas(3000);
  api.writeStore('restaurant-demo-pedidos', lista, 'x');
  const crudo = storage.get('restaurant-demo-pedidos');
  assert.ok(crudo.startsWith(api.marcaComprimido));
  assert.ok(crudo.length * 5 < JSON.stringify(lista).length, 'por lo menos 5 veces más chico');
  assert.deepEqual(api.readStore('restaurant-demo-pedidos', []), lista);
});

test('lo chico y lo que no está en la lista queda como texto común', () => {
  api.writeStore('restaurant-demo-pedidos', [{ id: 'p1' }], 'x');
  assert.equal(storage.get('restaurant-demo-pedidos'), '[{"id":"p1"}]');
  api.writeStore('restaurant-mesas', comandas(2000), 'x');
  assert.ok(!storage.get('restaurant-mesas').startsWith(api.marcaComprimido));
});

test('un celular que se había llenado libera lugar al abrir y vuelve a poder guardar', () => {
  const viejas = JSON.stringify(comandas(3000));
  storage.set('restaurant-demo-pedidos', viejas);
  storage.set('restaurant-pagos', JSON.stringify(comandas(3000)));
  cupo = viejas.length * 2 + 1000;
  // Lleno: ni las mesas entran (así quedaba el celular, con todo lo de ayer).
  const mesas = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, numero: i, estado: 'libre' }));
  assert.throws(() => api.writeStore('restaurant-mesas', mesas, 'x'), /sin espacio/);
  api.compactarAlmacenamiento();
  api.writeStore('restaurant-mesas', mesas, 'x');
  const nuevas = comandas(3200);
  api.writeStore('restaurant-demo-pedidos', nuevas, 'x');
  assert.deepEqual(api.readStore('restaurant-demo-pedidos', []), nuevas);
  assert.equal(api.readStore('restaurant-pagos', []).length, 3000);
});

test('deshacer una transacción vuelve al dato comprimido de antes', () => {
  const antes = comandas(3000);
  api.writeStore('restaurant-demo-pedidos', antes, 'x');
  assert.throws(() => api.withStoreTransaction(() => {
    api.writeStore('restaurant-demo-pedidos', [], 'x');
    throw new Error('falló');
  }));
  assert.deepEqual(api.readStore('restaurant-demo-pedidos', []), antes);
});
