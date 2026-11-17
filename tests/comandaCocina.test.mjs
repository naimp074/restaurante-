import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/lib/comandaCocina';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/comandaCocina.compiled.cjs'));
mod.filename = path.resolve('tests/comandaCocina.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { comandasPendientes, registrarImpresa, marcarTodoComoImpreso, htmlComanda } = mod.exports;

const item = (id, nombre, extra = {}) => ({ id, producto_id: `rest-${id}`, producto: { id: `rest-${id}`, nombre }, cantidad: 1, estado: 'pendiente', opciones: [], observaciones: '', ...extra });
const pedido = (items, extra = {}) => ({ id: 'p1', numero: 1, estado: 'en_preparacion', canal: 'salon', mesa: { numero: 4 }, cantidad_personas: 2, empleado: { nombre: 'Ana' }, items, ...extra });

test('una comanda recién enviada sale una sola vez', () => {
  const pedidos = [pedido([item('001', 'Empanadas'), item('050', 'Milanesa')])];
  const pendientes = comandasPendientes(pedidos, {});
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].tipo, 'nueva');
  const registro = registrarImpresa({}, pendientes[0]);
  assert.deepEqual(comandasPendientes(pedidos, registro), []);
});

test('lo que se carga sin enviar o con la comanda abierta no se imprime', () => {
  assert.deepEqual(comandasPendientes([pedido([item('001', 'Empanadas')], { estado: 'abierto' })], {}), []);
  assert.deepEqual(comandasPendientes([pedido([item('001', 'Empanadas', { sin_enviar: true })])], {}), []);
});

test('lo agregado después sale como agregado, solo con lo nuevo', () => {
  let registro = registrarImpresa({}, { items: [item('001', 'Empanadas')], tipo: 'nueva' });
  const pendientes = comandasPendientes([pedido([item('001', 'Empanadas', { estado: 'en_preparacion' }), item('060', 'Flan')])], registro);
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].tipo, 'agregado');
  assert.deepEqual(pendientes[0].items.map(i => i.id), ['060']);
  registro = registrarImpresa(registro, pendientes[0]);
  assert.ok(registro['060']);
});

test('lo anulado después de imprimir sale como anulación, una sola vez', () => {
  let registro = registrarImpresa({}, { items: [item('001', 'Empanadas')], tipo: 'nueva' });
  const pedidos = [pedido([item('001', 'Empanadas', { estado: 'cancelado', motivo_anulacion: 'Se equivocó' })])];
  const pendientes = comandasPendientes(pedidos, registro);
  assert.deepEqual(pendientes.map(c => c.tipo), ['anulacion']);
  registro = registrarImpresa(registro, pendientes[0]);
  assert.deepEqual(comandasPendientes(pedidos, registro), []);
  // Si se anula algo que nunca salió en papel, no hace falta avisar.
  assert.deepEqual(comandasPendientes([pedido([item('002', 'Chorizo', { estado: 'cancelado' })])], {}), []);
});

test('al activar no imprime lo que ya estaba en cocina', () => {
  const pedidos = [pedido([item('001', 'Empanadas')])];
  assert.deepEqual(comandasPendientes(pedidos, marcarTodoComoImpreso(pedidos, {})), []);
});

test('la comanda en papel no lleva precios y separa entradas de principales', () => {
  const html = htmlComanda({ pedido: pedido([]), items: [item('050', 'Milanesa'), item('001', 'Empanadas', { observaciones: 'sin sal' })], tipo: 'nueva' }, [], new Date('2026-11-17T12:00:00'));
  assert.ok(html.indexOf('Entradas') < html.indexOf('Platos principales'));
  assert.ok(html.indexOf('Empanadas') < html.indexOf('Milanesa'));
  assert.match(html, /sin sal/);
  assert.match(html, /Moza\/o: Ana/);
  assert.doesNotMatch(html, /\$/);
});
