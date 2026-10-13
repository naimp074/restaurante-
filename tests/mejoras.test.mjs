import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Jornada comercial, permisos por pantalla y compactación de datos guardados.
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/fechas';
  export * from './src/lib/paginas';
  export * from './src/lib/demoStore';
  export * from './src/lib/storeSync';
  export * from './src/lib/espacioLocal';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('tests/mejoras.compiled.cjs'));
mod.filename = path.resolve('tests/mejoras.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    key: i => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  } });
});

const configurarCorte = hora => storage.set('restaurant-config-local', JSON.stringify({ hora_corte: hora }));

test('con corte a las 5, lo cobrado a la 01:30 cuenta para el día anterior', () => {
  configurarCorte(5);
  assert.equal(api.dayKey(new Date(2026, 9, 17, 1, 30)), '2026-10-16');
  assert.equal(api.dayKey(new Date(2026, 9, 17, 5, 0)), '2026-10-17');
  assert.equal(api.dayKey(new Date(2026, 9, 16, 23, 59)), '2026-10-16');
});

test('sin configurar se usa el corte por defecto, y 0 vuelve al día calendario', () => {
  assert.equal(api.horaCorteJornada(), api.horaCortePorDefecto);
  configurarCorte(0);
  assert.equal(api.dayKey(new Date(2026, 9, 17, 1, 30)), '2026-10-17');
});

test('una fecha sin hora no se corre de día (antes caía en el día anterior por UTC)', () => {
  configurarCorte(5);
  assert.equal(api.dayKey('2026-10-13'), '2026-10-13');
});

test('un corte inválido no rompe el cálculo del día', () => {
  configurarCorte('cualquier cosa');
  assert.equal(api.horaCorteJornada(), api.horaCortePorDefecto);
  configurarCorte(30);
  assert.equal(api.horaCorteJornada(), api.horaCortePorDefecto);
});

test('el inicio de jornada agrupa la madrugada con el día anterior', () => {
  configurarCorte(5);
  const madrugada = api.inicioJornada(new Date(2026, 9, 17, 2, 0));
  assert.equal(madrugada.getTime(), new Date(2026, 9, 16).getTime());
});

test('cada rol solo entra a sus pantallas aunque escriba la dirección', () => {
  assert.equal(api.puedeVerPagina('moza', 'caja'), false);
  assert.equal(api.puedeVerPagina('moza', 'ventas'), true);
  assert.equal(api.puedeVerPagina('cocina', 'reportes'), false);
  assert.equal(api.puedeVerPagina('cajero', 'cuenta_corriente'), true);
  assert.equal(api.puedeVerPagina('cajero', 'stock'), false);
  assert.equal(api.puedeVerPagina('encargado', 'usuarios'), false);
  assert.equal(api.puedeVerPagina('admin', 'usuarios'), true);
});

test('la dirección (#/pagina) se traduce a la pantalla, e ignora lo desconocido', () => {
  assert.equal(api.paginaDesdeHash('#/caja_dia'), 'caja_dia');
  assert.equal(api.paginaDesdeHash(api.hashDePagina('stock_produccion')), 'stock_produccion');
  assert.equal(api.paginaDesdeHash('#/no-existe'), null);
  assert.equal(api.paginaDesdeHash('#/constructor'), null);
  assert.equal(api.paginaDesdeHash(''), null);
});

test('los movimientos de stock se guardan sin la copia completa del insumo', () => {
  api.saveDemoMovimientosStock([
    { id: 'm1', ingrediente_id: 'i1', tipo: 'salida', cantidad: 1, motivo: 'Venta', stock_anterior: 5, stock_nuevo: 4, created_at: 'x',
      ingrediente: { id: 'i1', nombre: 'Pan', stock_actual: 4 } },
  ]);
  const guardado = api.loadDemoMovimientosStock();
  assert.equal(guardado[0].ingrediente, undefined);
  assert.equal(guardado[0].ingrediente_id, 'i1');
});

test('el uso del almacenamiento se mide sobre el límite del navegador', () => {
  storage.set('restaurant-x', 'a'.repeat(1_000_000));
  const uso = api.usoAlmacenamientoLocal();
  assert.ok(uso > 0.19 && uso < 0.21, `uso ${uso}`);
});
