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
