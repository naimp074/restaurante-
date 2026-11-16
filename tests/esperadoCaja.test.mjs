import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Rehacer el efectivo esperado de un arqueo con los movimientos de la Caja del día.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/esperadoCaja'; export { cuentaCajaDiaId, cuentaCajaGrandeId, cuentaBancoId } from './src/lib/finance';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/esperadoCaja.compiled.cjs'));
mod.filename = path.resolve('tests/esperadoCaja.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;
const dia = api.cuentaCajaDiaId;

let n = 0;
const mov = (hora, tipo, monto, extra = {}) => ({
  id: `m${n++}`, fecha: '2026-11-12', tipo, origen: 'gasto', cuenta_id: dia, monto, created_at: `2026-11-12T${hora}:00.000Z`, ...extra,
});
const caja = { id: 'c', fecha: '2026-11-12', estado: 'cerrada', monto_inicial: 0, opened_at: '2026-11-12T19:28:00.000Z', closed_at: '2026-11-12T23:59:00.000Z', monto_esperado_efectivo: -33000 };

test('turno del 12/11: ventas 513.000, anulación 30.000 y gastos 528.500 dan -45.500', () => {
  const movs = [
    mov('07:20', 'transferencia', 535491, { origen: 'transferencia_interna', cuenta_destino_id: api.cuentaCajaGrandeId, descripcion: 'Cierre automatico: efectivo del 2026-11-11 a caja grande' }),
    mov('19:28', 'transferencia', 0, { origen: 'apertura_caja', cuenta_id: api.cuentaCajaGrandeId, cuenta_destino_id: dia }),
    mov('20:00', 'entrada', 513000, { origen: 'venta' }),
    mov('20:30', 'entrada', 50000, { origen: 'venta', cuenta_id: api.cuentaBancoId }),
    mov('21:11', 'salida', 30000, { origen: 'ajuste', descripcion: 'Anulación de venta Mesa 5 - efectivo' }),
    mov('22:00', 'salida', 516000, { metodo_pago: 'efectivo' }),
    mov('22:10', 'salida', 12500, { metodo_pago: 'efectivo', descripcion: 'cambio para caja' }),
    mov('22:20', 'salida', 80000, { origen: 'pago_proveedor', metodo_pago: 'transferencia' }),
  ];
  assert.equal(api.recalcularEsperadoEfectivo(caja, movs), -45500);
});

test('fondo inicial, traspasos en efectivo y los de transferencias/tarjeta', () => {
  const movs = [
    mov('19:30', 'transferencia', 10000, { origen: 'transferencia_interna', cuenta_id: api.cuentaCajaGrandeId, cuenta_destino_id: dia, descripcion: 'Apertura de caja: fondo inicial del día' }),
    mov('20:00', 'entrada', 100000, { origen: 'venta' }),
    mov('21:00', 'transferencia', 40000, { origen: 'transferencia_interna', cuenta_destino_id: api.cuentaCajaGrandeId, descripcion: 'Traspaso de Caja del día a Caja grande' }),
    mov('21:30', 'transferencia', 60000, { origen: 'transferencia_interna', cuenta_destino_id: api.cuentaBancoId, descripcion: 'Traspaso de Caja del día a Banco (transferencias/tarjeta)' }),
    mov('23:59', 'transferencia', 70000, { origen: 'transferencia_interna', cuenta_destino_id: api.cuentaCajaGrandeId, descripcion: 'Cierre de caja del 2026-11-12: efectivo del día a caja grande' }),
  ];
  assert.equal(api.recalcularEsperadoEfectivo(caja, movs), 70000);
});

test('horarios escritos distinto (Z / +00:00, sin milésimas) caen igual dentro de la caja', () => {
  const abierta = { ...caja, opened_at: '2026-11-12T19:28:00.000Z', closed_at: '2026-11-12T23:59:00.000Z' };
  const movs = [
    mov('19:30', 'entrada', 1000, { origen: 'venta', created_at: '2026-11-12T19:30:00+00:00' }),
    mov('19:31', 'salida', 300, { metodo_pago: 'efectivo', created_at: '2026-11-12T19:31:00Z' }),
    mov('19:00', 'salida', 999, { metodo_pago: 'efectivo', created_at: '2026-11-12T19:00:00+00:00' }),
  ];
  assert.equal(api.recalcularEsperadoEfectivo(abierta, movs), 700);
  assert.equal(api.efectivoGastadoDeLaCaja(abierta, movs), 300);
});

test('los gastos son los del horario de la caja: el turno de la tarde no ve los de la mañana', () => {
  const manana = { id: 'm', fecha: '2026-11-12', estado: 'cerrada', monto_inicial: 0, opened_at: '2026-11-12T12:00:00.000Z', closed_at: '2026-11-12T17:00:00.000Z', monto_esperado_efectivo: 0 };
  const tarde = { id: 't', fecha: '2026-11-12', estado: 'abierta', monto_inicial: 0, opened_at: '2026-11-12T20:00:00.000Z', monto_esperado_efectivo: 0 };
  const movs = [
    mov('13:00', 'salida', 5000, { metodo_pago: 'efectivo', descripcion: 'Hielo' }),
    mov('18:00', 'salida', 700, { metodo_pago: 'efectivo', descripcion: 'Entre turnos' }),
    mov('21:00', 'salida', 2000, { metodo_pago: 'efectivo', descripcion: 'Pan', fecha: '2026-11-11' }),
    mov('21:30', 'salida', 900, { metodo_pago: 'transferencia', descripcion: 'Gas' }),
    mov('21:40', 'salida', 400, { origen: 'ajuste', descripcion: 'Anulación de venta Mesa 2 - efectivo' }),
  ];
  assert.equal(api.efectivoGastadoDeLaCaja(manana, movs), 5000);
  // El de 2.000 se cargó con otra fecha pero la plata salió del cajón en la tarde: cuenta para la tarde.
  assert.equal(api.efectivoGastadoDeLaCaja(tarde, movs), 2000);
});

test('un gasto editado o borrado no queda duplicado en el resumen, y el esperado no cambia', () => {
  const abierta = { ...caja, estado: 'abierta', closed_at: undefined };
  const movs = [
    mov('20:00', 'entrada', 10000, { origen: 'venta' }),
    mov('20:10', 'salida', 3000, { metodo_pago: 'efectivo', descripcion: 'Luz' }),
    mov('20:20', 'entrada', 3000, { origen: 'ajuste', descripcion: 'Edicion de gasto: Luz' }),
    mov('20:20', 'salida', 3500, { metodo_pago: 'efectivo', descripcion: 'Luz', created_at: '2026-11-12T20:20:00.001Z' }),
    mov('20:30', 'salida', 800, { metodo_pago: 'efectivo', descripcion: 'Hielo' }),
    mov('20:40', 'entrada', 800, { origen: 'ajuste', descripcion: 'Anulacion de gasto: Hielo' }),
  ];
  assert.equal(api.efectivoGastadoDeLaCaja(abierta, movs), 3500);
  assert.equal(api.sinGastosRevertidos(movs).filter(m => m.tipo === 'salida').map(m => m.monto).join(','), '3500');
  assert.equal(api.recalcularEsperadoEfectivo(abierta, movs), 6500);
});

test('una caja de ayer que quedó abierta sigue siendo la caja a cerrar', () => {
  const ayer = { id: 'a', fecha: '2026-11-11', estado: 'abierta', opened_at: '2026-11-11T20:00:00.000Z' };
  const vieja = { id: 'v', fecha: '2026-11-10', estado: 'cerrada', opened_at: '2026-11-10T20:00:00.000Z' };
  assert.equal(api.cajaAbiertaActual([vieja, ayer], '2026-11-12')?.id, 'a');
  const hoy = { id: 'h', fecha: '2026-11-12', estado: 'abierta', opened_at: '2026-11-12T20:00:00.000Z' };
  assert.equal(api.cajaAbiertaActual([ayer, hoy], '2026-11-12')?.id, 'h');
  assert.equal(api.cajaAbiertaActual([vieja], '2026-11-12'), null);
});

test('los cobros del arqueo son los del horario de la caja', () => {
  const cobros = [
    { id: 'p1', created_at: '2026-11-12T19:00:00.000Z' },
    { id: 'p2', created_at: '2026-11-12T22:00:00+00:00' },
    { id: 'p3', created_at: '2026-11-12T20:00:00.000Z' },
  ];
  assert.deepEqual(api.pagosDeLaCaja(caja, cobros).map(p => p.id), ['p3', 'p2']);
});
