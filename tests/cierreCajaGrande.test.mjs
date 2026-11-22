import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Al cerrar la caja, a la Caja grande va el efectivo contado en el cajón, no el saldo de la cuenta Caja del día.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/finance'; export { recalcularEsperadoEfectivo, yaPasadoACajaGrande } from './src/lib/esperadoCaja';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/cierreCajaGrande.compiled.cjs'));
mod.filename = path.resolve('tests/cierreCajaGrande.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const now = new Date();
const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const get = key => JSON.parse(storage.get(`restaurant-${key}`) || '[]');
const saldo = id => get('cuentas-dinero').find(c => c.id === id).saldo;

const preparar = ({ grande = 1000000, dia = 0, saldoFechaDia = hoy, cajaAbierta = true } = {}) => {
  storage.set('restaurant-cuentas-dinero', JSON.stringify([
    { id: 'cuenta-caja-dia', nombre: 'Caja del día', tipo: 'efectivo', saldo: dia, saldo_fecha: saldoFechaDia, activa: true },
    { id: 'cuenta-caja-grande', nombre: 'Caja grande', tipo: 'efectivo', saldo: grande, activa: true },
    { id: 'cuenta-banco', nombre: 'Banco', tipo: 'banco', saldo: 0, activa: true },
  ]));
  storage.set('restaurant-cajas-diarias', JSON.stringify(cajaAbierta
    ? [{ id: 'caja-1', fecha: saldoFechaDia, estado: 'abierta', monto_inicial: 0, monto_esperado_efectivo: dia, opened_at: '2000-01-01T00:00:00.000Z' }]
    : []));
};

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
});

test('cuentan 40.000 en el cajón: la caja grande sube 40.000 aunque la cuenta diga otra cosa', () => {
  // La cuenta quedó en 25.000 porque se anotó contra la Caja del día un gasto de 15.000 pagado por transferencia.
  preparar({ grande: 1000000, dia: 25000 });
  const pasado = api.cerrarCajaDia('Cierre de caja: efectivo del día a caja grande', 40000);
  assert.equal(pasado, 40000);
  assert.equal(saldo('cuenta-caja-grande'), 1040000);
  assert.equal(saldo('cuenta-caja-dia'), 0);
  const ajuste = get('movimientos-financieros').find(m => m.origen === 'ajuste');
  assert.equal(ajuste.tipo, 'entrada');
  assert.equal(ajuste.monto, 15000);
});

test('con faltante: a la caja grande va lo que hay, no lo que debería haber', () => {
  preparar({ grande: 500000, dia: 50000 });
  api.cerrarCajaDia('Cierre de caja', 47000);
  assert.equal(saldo('cuenta-caja-grande'), 547000);
  assert.equal(saldo('cuenta-caja-dia'), 0);
});

test('con la caja abierta pasada la medianoche no se arrastra el saldo: lo pasa el cierre con lo contado', () => {
  preparar({ grande: 100000, dia: 60000, saldoFechaDia: '2000-01-01', cajaAbierta: true });
  api.loadCuentasDinero();
  assert.equal(saldo('cuenta-caja-grande'), 100000);
  assert.equal(saldo('cuenta-caja-dia'), 60000);
  api.cerrarCajaDia('Cierre de caja', 40000);
  assert.equal(saldo('cuenta-caja-grande'), 140000);
});

test('sin caja abierta, el saldo viejo se sigue pasando solo a la caja grande', () => {
  preparar({ grande: 100000, dia: 30000, saldoFechaDia: '2000-01-01', cajaAbierta: false });
  api.loadCuentasDinero();
  assert.equal(saldo('cuenta-caja-grande'), 130000);
  assert.equal(saldo('cuenta-caja-dia'), 0);
});

test('si un cierre automático viejo ya pasó plata de esta caja, no se cuenta dos veces', () => {
  // A la medianoche se pasaron 30.000 (versión anterior); al cerrar se cuentan 40.000 en total.
  preparar({ grande: 130000, dia: 10000 });
  api.cerrarCajaDia('Cierre de caja', 40000, 30000);
  assert.equal(saldo('cuenta-caja-grande'), 140000);
  assert.equal(saldo('cuenta-caja-dia'), 0);
});

test('el ajuste y el pase del cierre no cambian el esperado del turno', () => {
  const caja = { id: 'c', fecha: hoy, estado: 'cerrada', monto_inicial: 0, opened_at: '2026-11-21T20:00:00.000Z', closed_at: '2026-11-22T03:00:00.000Z', monto_esperado_efectivo: 0 };
  const dia = api.cuentaCajaDiaId;
  const movs = [
    { id: 'a', fecha: hoy, tipo: 'entrada', origen: 'venta', cuenta_id: dia, monto: 50000, created_at: '2026-11-21T21:00:00.000Z' },
    { id: 'b', fecha: hoy, tipo: 'salida', origen: 'gasto', cuenta_id: dia, monto: 10000, metodo_pago: 'efectivo', created_at: '2026-11-21T22:00:00.000Z' },
    { id: 'c1', fecha: hoy, tipo: 'transferencia', origen: 'transferencia_interna', cuenta_id: dia, cuenta_destino_id: api.cuentaCajaGrandeId, monto: 40000, descripcion: 'Cierre de caja del x: efectivo del día a caja grande', created_at: '2026-11-22T02:59:00.000Z' },
    { id: 'c2', fecha: hoy, tipo: 'salida', origen: 'ajuste', cuenta_id: dia, monto: 5000, descripcion: 'Cierre de caja: ajuste de la Caja del día al efectivo contado (no va a la caja grande)', created_at: '2026-11-22T02:59:00.000Z' },
    { id: 'c3', fecha: hoy, tipo: 'transferencia', origen: 'transferencia_interna', cuenta_id: dia, cuenta_destino_id: api.cuentaCajaGrandeId, monto: 30000, descripcion: 'Cierre automatico: efectivo del x a caja grande', created_at: '2026-11-22T00:00:01.000Z' },
  ];
  assert.equal(api.recalcularEsperadoEfectivo(caja, movs), 40000);
  assert.equal(api.yaPasadoACajaGrande(caja, movs), 30000);
});
