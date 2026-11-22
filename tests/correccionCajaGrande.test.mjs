import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Deshacer la corrección por arqueos (sumaba días dos veces) y ajustar la Caja grande al conteo de la caja fuerte.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/correccionCajaGrande'; export { cuentaCajaDiaId, cuentaCajaGrandeId } from './src/lib/finance';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/correccionCajaGrande.compiled.cjs'));
mod.filename = path.resolve('tests/correccionCajaGrande.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;
const dia = api.cuentaCajaDiaId;
const grande = api.cuentaCajaGrandeId;

let storage;
const put = (key, value) => storage.set(`restaurant-${key}`, JSON.stringify(value));
const get = key => JSON.parse(storage.get(`restaurant-${key}`) || '[]');
const saldoGrande = () => get('cuentas-dinero').find(c => c.id === grande).saldo;
const correccion = (id, tipo, monto, fecha) => ({
  id, fecha: '2026-11-22', tipo, origen: 'ajuste', cuenta_id: grande, monto,
  descripcion: `Corrección con el arqueo del ${fecha}: se contaron 1 y entraron 0 (caja c-${id})`, created_at: '2026-11-22T09:30:00.000Z',
});

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  put('cuentas-dinero', [
    { id: dia, nombre: 'Caja del día', tipo: 'efectivo', saldo: 0, saldo_fecha: '2099-01-01', activa: true },
    { id: grande, nombre: 'Caja grande', tipo: 'efectivo', saldo: 2358085, activa: true },
  ]);
  put('cajas-diarias', []);
  put('movimientos-financieros', [
    correccion('a', 'entrada', 429500, '2026-11-15'),
    correccion('b', 'entrada', 38500, '2026-11-15'),
    correccion('c', 'salida', 45700, '2026-11-18'),
    { id: 'x', fecha: '2026-11-18', tipo: 'transferencia', origen: 'transferencia_interna', cuenta_id: dia, cuenta_destino_id: grande, monto: 86200, descripcion: 'Cierre de caja del 2026-11-18: efectivo del día a caja grande', created_at: '2026-11-18T23:30:00.000Z' },
  ]);
});

test('deshacer la corrección deja la Caja grande como estaba y conserva los demás movimientos', () => {
  assert.deepEqual(api.totalCorreccionArqueos(), { cantidad: 3, total: 422300 });
  assert.equal(api.deshacerCorreccionArqueos(), 422300);
  assert.equal(saldoGrande(), 2358085 - 422300);
  assert.deepEqual(get('movimientos-financieros').map(m => m.id), ['x']);
  // Una segunda vez no hace nada.
  assert.equal(api.deshacerCorreccionArqueos(), 0);
  assert.equal(saldoGrande(), 2358085 - 422300);
});

test('ajustar al conteo deja el saldo en lo contado y anota la diferencia', () => {
  assert.equal(api.ajustarCajaGrandeAlConteo(1300000), 1300000 - 2358085);
  assert.equal(saldoGrande(), 1300000);
  const ajuste = get('movimientos-financieros').find(m => api.esAjustePorConteo(m));
  assert.equal(ajuste.tipo, 'salida');
  assert.equal(ajuste.monto, 2358085 - 1300000);
  assert.equal(api.ajustarCajaGrandeAlConteo(1300000), 0);
  assert.throws(() => api.ajustarCajaGrandeAlConteo(-5));
});
