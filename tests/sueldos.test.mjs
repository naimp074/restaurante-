import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Pago rápido de sueldos y estado de cuenta por persona.
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/sueldos';
  export * from './src/lib/gastosStore';
  export * from './src/lib/finance';
  export * from './src/lib/cajaStore';
  export * from './src/lib/storeSync';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' } });
const mod = new Module(path.resolve('tests/sueldos.compiled.cjs'));
mod.filename = path.resolve('tests/sueldos.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const leer = clave => JSON.parse(storage.get(`restaurant-${clave}`) || 'null');
const ana = { id: 'emp-ana', nombre: 'Ana', apellido: 'Gómez', rol: 'moza', activo: true, sueldo: 600000, created_at: '', updated_at: '' };

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  } });
  api.resetStoreWriteMarks();
});

const pagar = (extra = {}) => api.pagarSueldo({
  usuario: ana, periodo: '2026-11', monto: 200000, fecha: '2026-11-04', metodo_pago: 'transferencia',
  cuenta_id: api.cuentaBancoId, desde_caja_dia: false, cuenta_caja_dia_id: api.cuentaCajaDiaId, ...extra,
});

test('el pago rápido queda como gasto de sueldo y descuenta la plata de la cuenta', () => {
  const saldoAntes = api.loadCuentasDinero().find(c => c.id === api.cuentaBancoId).saldo;
  const gasto = pagar();
  assert.equal(gasto.categoria, 'sueldo');
  assert.equal(gasto.empleado_id, 'emp-ana');
  assert.equal(gasto.periodo, '2026-11');
  assert.equal(gasto.concepto, 'Sueldo Ana Gómez · noviembre 2026');
  assert.equal(api.loadGastos().length, 1);
  const saldoDespues = api.loadCuentasDinero().find(c => c.id === api.cuentaBancoId).saldo;
  assert.equal(saldoAntes - saldoDespues, 200000);
});

test('pago parcial y después completo', () => {
  pagar();
  let mes = api.mesDeSueldo(ana, api.loadGastos(), '2026-11');
  assert.equal(mes.estado, 'parcial');
  assert.equal(mes.resta, 400000);
  pagar({ monto: 400000 });
  mes = api.mesDeSueldo(ana, api.loadGastos(), '2026-11');
  assert.equal(mes.estado, 'pagado');
  assert.equal(mes.resta, 0);
});

test('el estado de cuenta muestra como impagos los meses sin pago desde el primer pago', () => {
  pagar({ periodo: '2026-09', monto: 600000 });
  const cuenta = api.estadoDeCuenta(ana, api.loadGastos(), '2026-11');
  assert.deepEqual(cuenta.meses.map(m => [m.periodo, m.estado]), [
    ['2026-11', 'sin_pagar'], ['2026-10', 'sin_pagar'], ['2026-09', 'pagado'],
  ]);
  assert.equal(cuenta.totalAdeudado, 1200000);
  assert.equal(cuenta.totalPagado, 600000);
});

test('si sube el sueldo, los meses ya pagados conservan el de entonces', () => {
  pagar({ periodo: '2026-10', monto: 600000 });
  const conAumento = { ...ana, sueldo: 700000 };
  assert.equal(api.mesDeSueldo(conAumento, api.loadGastos(), '2026-10').estado, 'pagado');
  assert.equal(api.mesDeSueldo(conAumento, api.loadGastos(), '2026-11').resta, 700000);
});

test('un sueldo cargado como pendiente no cuenta como pagado ni mueve plata', () => {
  api.registrarGasto({ id: 'g1', fecha: '2026-11-04', concepto: 'Sueldo Ana', categoria: 'sueldo', alcance: 'general',
    metodo_pago: 'efectivo', monto: 600000, observaciones: '', created_at: '', estado: 'pendiente',
    cuenta_origen_id: api.cuentaCajaGrandeId, empleado_id: 'emp-ana', periodo: '2026-11' });
  assert.equal(api.mesDeSueldo(ana, api.loadGastos(), '2026-11').estado, 'sin_pagar');
  assert.equal(leer('movimientos-financieros')?.length || 0, 0);
});

test('en efectivo desde la caja del día baja lo esperado en el arqueo', () => {
  storage.set('restaurant-cajas-diarias', JSON.stringify([{ id: 'c1', fecha: '2026-11-04', estado: 'abierta', monto_esperado_efectivo: 300000 }]));
  pagar({ metodo_pago: 'efectivo', desde_caja_dia: true, monto: 50000 });
  const caja = api.loadCajasDiarias().find(c => c.id === 'c1');
  assert.equal(caja.monto_esperado_efectivo, 250000);
  assert.equal(api.loadGastos()[0].alcance, 'caja_dia');
});

test('no deja pagar cero', () => {
  assert.throws(() => pagar({ monto: 0 }), /mayor que cero/);
});
