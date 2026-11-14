import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Detalle de "Ventas del día": los cobros de cada medio, con lo que se vendió.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/ventasCaja';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/ventasCaja.compiled.cjs'));
mod.filename = path.resolve('tests/ventasCaja.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { ventasDeMedio, productosVendidos } = mod.exports;

const pago = (id, metodo, partes) => ({
  id, metodo_pago: metodo, monto_efectivo: 0, monto_transferencia: 0, monto_debito: 0, monto_credito: 0,
  total_cobrado: Object.values(partes).reduce((a, b) => a + b, 0), ...partes,
});

test('cada medio trae sus cobros; un mixto aparece en los dos con su parte', () => {
  const pagos = [
    pago('a', 'efectivo', { monto_efectivo: 19000 }),
    pago('b', 'transferencia', { monto_transferencia: 31000 }),
    pago('c', 'mixto', { monto_efectivo: 5000, monto_transferencia: 7000 }),
    pago('d', 'debito', { monto_debito: 8000 }),
  ];
  assert.deepEqual(ventasDeMedio(pagos, 'efectivo').map(v => [v.pago.id, v.monto]), [['a', 19000], ['c', 5000]]);
  assert.deepEqual(ventasDeMedio(pagos, 'transferencia').map(v => [v.pago.id, v.monto]), [['b', 31000], ['c', 7000]]);
  assert.deepEqual(ventasDeMedio(pagos, 'tarjeta').map(v => [v.pago.id, v.monto]), [['d', 8000]]);
  assert.deepEqual(ventasDeMedio(pagos, 'total').map(v => v.monto), [19000, 31000, 12000, 8000]);
});

test('lo vendido sin los productos anulados', () => {
  const pedido = { items: [
    { cantidad: 2, estado: 'entregado', producto: { nombre: 'Light' } },
    { cantidad: 1, estado: 'cancelado', producto: { nombre: 'Fit' } },
    { cantidad: 1, estado: 'entregado', producto: { nombre: 'Avocado' } },
  ] };
  assert.equal(productosVendidos(pedido), '2x Light, 1x Avocado');
  assert.equal(productosVendidos(undefined), '');
});
