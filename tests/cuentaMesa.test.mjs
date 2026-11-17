import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export { htmlCuentaMesa } from './src/lib/cuentaMesa';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/cuentaMesa.compiled.cjs'));
mod.filename = path.resolve('tests/cuentaMesa.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { htmlCuentaMesa } = mod.exports;

const item = (id, nombre, subtotal, extra = {}) => ({ id, producto_id: `rest-${id}`, producto: { id: `rest-${id}`, nombre }, cantidad: 1, subtotal, estado: 'pendiente', opciones: [], observaciones: '', ...extra });
const pedido = {
  id: 'p1', numero: 1, estado: 'en_preparacion', canal: 'salon', mesa: { numero: 7 }, cantidad_personas: 2, empleado: { nombre: 'Ana' },
  subtotal: 37000, descuento: 0, recargo: 0, total: 37000,
  items: [item('050', 'Milanesa', 22000), item('001', 'Empanadas', 15000, { cantidad: 5 }), item('002', 'Chorizo', 5000, { estado: 'cancelado' })],
};

test('la cuenta con la mesa abierta lleva precios, total y entradas separadas', () => {
  const html = htmlCuentaMesa(pedido, 'La Parrilla', [], new Date('2026-11-17T21:00:00'));
  assert.match(html, /LA PARRILLA|La Parrilla/);
  assert.match(html, /NO VÁLIDO COMO FACTURA/);
  assert.match(html, /Mesa 7/);
  assert.match(html, /Total: \$37\.000/);
  assert.ok(html.indexOf('Empanadas') < html.indexOf('Milanesa'));
  assert.doesNotMatch(html, /Chorizo/);
});

test('muestra descuento y recargo cuando los hay', () => {
  const html = htmlCuentaMesa({ ...pedido, descuento: 2000, recargo: 0, total: 35000 }, 'X');
  assert.match(html, /Subtotal/);
  assert.match(html, /Descuento<\/span><span>-\$2\.000/);
  assert.match(html, /Total: \$35\.000/);
});
