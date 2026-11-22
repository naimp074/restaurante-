import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Rehacer la Caja grande con los arqueos: en cada cierre tenía que entrar el efectivo contado.
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

const caja = (id, fecha, abre, cierra, contado) => ({
  id, fecha, estado: 'cerrada', monto_inicial: 0, monto_esperado_efectivo: contado, monto_cierre_efectivo: contado,
  opened_at: `${fecha}T${abre}:00.000Z`, closed_at: `${fecha}T${cierra}:00.000Z`, cerrado_por_nombre: 'Ana',
});
let n = 0;
const pase = (fecha, hora, monto, descripcion, extra = {}) => ({
  id: `m${n++}`, fecha, tipo: 'transferencia', origen: 'transferencia_interna', cuenta_id: dia, cuenta_destino_id: grande,
  monto, descripcion, created_at: `${fecha}T${hora}.000Z`, ...extra,
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
    { id: grande, nombre: 'Caja grande', tipo: 'efectivo', saldo: 1000000, activa: true },
  ]);
  put('cajas-diarias', [
    // Contaron 40.000 pero entró el saldo de la cuenta (25.000).
    caja('c1', '2026-11-18', '20:00', '23:30', 40000),
    // Contaron 50.000 y entraron 50.000: está bien.
    caja('c2', '2026-11-19', '20:00', '23:30', 50000),
    // Pasó la medianoche: el cierre automático mandó 70.000 y al cerrar se pasaron 5.000 más; contaron 60.000.
    { ...caja('c3', '2026-11-20', '20:00', '23:59', 60000), closed_at: '2026-11-21T02:00:00.000Z' },
  ]);
  put('movimientos-financieros', [
    pase('2026-11-18', '23:30:00.050', 25000, 'Cierre de caja del 2026-11-18: efectivo del día a caja grande'),
    pase('2026-11-19', '23:30:00.050', 50000, 'Cierre de caja del 2026-11-19: efectivo del día a caja grande'),
    pase('2026-11-21', '00:00:05', 70000, 'Cierre automatico: efectivo del 2026-11-20 a caja grande'),
    pase('2026-11-21', '02:00:00.050', 5000, 'Cierre de caja del 2026-11-20: efectivo del día a caja grande'),
    // Un traspaso común no es parte del cierre.
    pase('2026-11-19', '21:00:00', 10000, 'Traspaso de Caja del día a Caja grande'),
  ]);
});

test('compara lo contado con lo que entró, caja por caja', () => {
  const revision = api.revisarCajaGrandeConArqueos();
  assert.deepEqual(revision.map(f => [f.cajaId, f.contado, f.entro, f.diferencia]), [
    ['c1', 40000, 25000, 15000],
    ['c2', 50000, 50000, 0],
    ['c3', 60000, 75000, -15000],
  ]);
  assert.equal(api.arqueosConDiferencia(revision).length, 2);
});

test('corrige la Caja grande una sola vez', () => {
  const aplicado = api.corregirCajaGrandeConArqueos();
  assert.equal(aplicado, 0);
  assert.equal(saldoGrande(), 1000000);
  const correcciones = get('movimientos-financieros').filter(m => m.origen === 'ajuste');
  assert.equal(correcciones.length, 2);
  assert.deepEqual(correcciones.map(m => [m.tipo, m.monto]).sort(), [['entrada', 15000], ['salida', 15000]]);
  // Ya corregido: no queda nada pendiente ni se vuelve a aplicar.
  assert.equal(api.arqueosConDiferencia(api.revisarCajaGrandeConArqueos()).length, 0);
  assert.equal(api.corregirCajaGrandeConArqueos(), 0);
  assert.equal(get('movimientos-financieros').filter(m => m.origen === 'ajuste').length, 2);
});

test('si solo faltó plata, la Caja grande sube lo que falta', () => {
  put('cajas-diarias', [caja('c1', '2026-11-18', '20:00', '23:30', 40000)]);
  assert.equal(api.corregirCajaGrandeConArqueos(), 15000);
  assert.equal(saldoGrande(), 1015000);
});

test('una caja cerrada con la versión nueva ya coincide', () => {
  put('cajas-diarias', [caja('c9', '2026-11-22', '20:00', '23:30', 40000)]);
  put('movimientos-financieros', [pase('2026-11-22', '23:29:59.990', 40000, 'Cierre de caja del 2026-11-22: efectivo del día a caja grande')]);
  assert.equal(api.arqueosConDiferencia(api.revisarCajaGrandeConArqueos()).length, 0);
});
