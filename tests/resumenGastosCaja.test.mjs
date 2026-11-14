import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Resumen de gastos del arqueo: efectivo, proveedores, transferencia y tarjeta.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/resumenGastosCaja';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/resumenGastosCaja.compiled.cjs'));
mod.filename = path.resolve('tests/resumenGastosCaja.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { resumenGastosCaja } = mod.exports;

const mov = (monto, extra) => ({ id: `m-${monto}`, fecha: '2026-11-13', tipo: 'salida', origen: 'gasto', cuenta_id: 'c', monto, created_at: '', ...extra });

test('separa los gastos por medio y los proveedores aparte', () => {
  const resumen = resumenGastosCaja([
    mov(10000, { metodo_pago: 'efectivo' }),
    mov(5000, { metodo_pago: 'efectivo' }),
    mov(80000, { origen: 'pago_proveedor', metodo_pago: 'transferencia' }),
    mov(30000, { metodo_pago: 'efectivo', proveedor_id: 'prov-1' }),
    mov(20000, { metodo_pago: 'transferencia' }),
    mov(7000, { metodo_pago: 'mercado_pago' }),
    mov(12000, { metodo_pago: 'debito' }),
    mov(3000, { origen: 'retiro' }),
    mov(99999, { tipo: 'transferencia', origen: 'transferencia_interna' }),
    mov(1000, { tipo: 'entrada', origen: 'ajuste' }),
  ]);
  assert.deepEqual(resumen, { efectivo: 15000, proveedores: 110000, transferencia: 27000, tarjeta: 12000, otros: 3000, total: 167000 });
});

test('sin movimientos da todo en cero', () => {
  assert.equal(resumenGastosCaja([]).total, 0);
});
