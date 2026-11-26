import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Cambiar a mano el precio de un producto en la comanda (ej: la diferencia por otra gaseosa).
const compiled = await build({
  stdin: { contents: `export { cambiarPrecioItem, puedeCambiarPrecio } from './src/lib/cobroComanda';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/cambiarPrecioItem.compiled.cjs'));
mod.filename = path.resolve('tests/cambiarPrecioItem.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const item = (id, precio, estado = 'entregado', cantidad = 1) => ({
  id, pedido_id: 'p1', producto_id: id, producto: { id, nombre: id }, cantidad, precio_unitario: precio,
  subtotal: cantidad * precio, observaciones: '', estado, created_at: '', updated_at: '',
});
const pedido = (extra = {}) => ({
  id: 'p1', estado: 'entregado', descuento: 0, recargo: 0, historial: [],
  items: [item('gaseosa', 12000), item('milanesa', 22000, 'entregado', 2)],
  subtotal: 56000, total: 56000, ...extra,
});
const cajera = { id: 'u1', nombre: 'Ana', rol: 'cajero' };

test('la carta dice 12 mil y se cobra 15 mil: el total de la comanda sube 3 mil', () => {
  const p = api.cambiarPrecioItem(pedido(), 'gaseosa', 15000, 'cambio por gaseosa de 1,5 L', cajera);
  const gaseosa = p.items.find(i => i.id === 'gaseosa');
  assert.equal(gaseosa.precio_unitario, 15000);
  assert.equal(gaseosa.subtotal, 15000);
  assert.equal(gaseosa.precio_original, 12000);
  assert.equal(p.subtotal, 59000);
  assert.equal(p.total, 59000);
  const evento = p.historial.at(-1);
  assert.equal(evento.tipo, 'precio_cambiado');
  assert.equal(evento.usuario_nombre, 'Ana');
  assert.match(evento.detalle, /12\.000 → \$15\.000.*cambio por gaseosa/);
});

test('multiplica por la cantidad y conserva el precio de la carta si se cambia dos veces', () => {
  let p = api.cambiarPrecioItem(pedido(), 'milanesa', 20000, 'promo', cajera);
  assert.equal(p.items.find(i => i.id === 'milanesa').subtotal, 40000);
  p = api.cambiarPrecioItem(p, 'milanesa', 21000, 'corrijo', cajera);
  assert.equal(p.items.find(i => i.id === 'milanesa').precio_original, 22000);
  assert.equal(p.total, 12000 + 42000);
});

test('solo admin, encargado y cajero; con motivo; no en comandas cobradas o con ticket', () => {
  assert.equal(api.puedeCambiarPrecio('moza'), false);
  assert.equal(api.puedeCambiarPrecio('encargado'), true);
  assert.throws(() => api.cambiarPrecioItem(pedido(), 'gaseosa', 15000, 'x', { nombre: 'Lu', rol: 'moza' }), /admin, encargado o cajero/);
  assert.throws(() => api.cambiarPrecioItem(pedido(), 'gaseosa', 15000, '  ', cajera), /motivo/);
  assert.throws(() => api.cambiarPrecioItem(pedido(), 'gaseosa', -1, 'x', cajera), /precio válido/);
  assert.throws(() => api.cambiarPrecioItem(pedido({ estado: 'cobrado' }), 'gaseosa', 15000, 'x', cajera), /cerrada/);
  assert.throws(() => api.cambiarPrecioItem(pedido({ solicitud_cobro: { estado: 'ticket_emitido' } }), 'gaseosa', 15000, 'x', cajera), /ticket/);
});
