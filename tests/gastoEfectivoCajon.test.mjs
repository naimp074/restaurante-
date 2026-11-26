import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// El tope de un gasto en efectivo es el "Esperado efectivo" de la pantalla de Caja, no un número guardado atrasado.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/finance'; export { efectivoEnCajaAbierta } from './src/lib/esperadoCaja';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/gastoEfectivoCajon.compiled.cjs'));
mod.filename = path.resolve('tests/gastoEfectivoCajon.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const put = (key, value) => storage.set(`restaurant-${key}`, JSON.stringify(value));
const now = new Date();
const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const hace = minutos => new Date(Date.now() - minutos * 60000).toISOString();

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  const dia = api.cuentaCajaDiaId;
  put('cuentas-dinero', [
    { id: dia, nombre: 'Caja del día', tipo: 'efectivo', saldo: 237000, saldo_fecha: hoy, activa: true },
    { id: api.cuentaCajaGrandeId, nombre: 'Caja grande', tipo: 'efectivo', saldo: 500000, activa: true },
  ]);
  // La caja guardó un esperado atrasado ($64.000), pero entraron $38.000 de fondo y $199.000 en efectivo.
  put('cajas-diarias', [{ id: 'c1', fecha: hoy, estado: 'abierta', monto_inicial: 38000, monto_esperado_efectivo: 64000, opened_at: hace(300) }]);
  put('movimientos-financieros', [
    { id: 'm1', fecha: hoy, tipo: 'transferencia', origen: 'transferencia_interna', cuenta_id: api.cuentaCajaGrandeId, cuenta_destino_id: dia, monto: 38000, descripcion: 'Apertura de caja', created_at: hace(299) },
    { id: 'm2', fecha: hoy, tipo: 'entrada', origen: 'venta', cuenta_id: dia, monto: 199000, descripcion: 'Venta Mesa 1 - efectivo', created_at: hace(100) },
  ]);
});

test('el efectivo del cajón es el esperado de la pantalla de Caja, no el número guardado', () => {
  assert.equal(api.efectivoEnCajaAbierta(hoy), 237000);
});

test('un gasto en efectivo de $173.000 con $237.000 en el cajón se guarda', () => {
  api.registrarSalidaCuenta({ cuenta_id: api.cuentaCajaDiaId, monto: 173000, descripcion: 'Gasto extra', origen: 'gasto', metodo_pago: 'efectivo', fecha: hoy });
  assert.equal(api.loadCuentasDinero().find(c => c.id === api.cuentaCajaDiaId).saldo, 64000);
});

test('un gasto mayor a lo que hay en el cajón se sigue frenando', () => {
  assert.throws(
    () => api.registrarSalidaCuenta({ cuenta_id: api.cuentaCajaDiaId, monto: 300000, descripcion: 'Gasto', origen: 'gasto', metodo_pago: 'efectivo', fecha: hoy }),
    /hay \$237\.000 en efectivo/,
  );
});
