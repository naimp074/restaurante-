import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/lib/seccionesTicket'; export { armarCartaRestaurante } from './src/lib/cartaRestaurante';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/seccionesTicket.compiled.cjs'));
mod.filename = path.resolve('tests/seccionesTicket.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { agruparPorSeccion, htmlItemsPorSeccion, seccionDelProducto, armarCartaRestaurante } = mod.exports;

const item = (producto_id, nombre, seccion_ticket) => ({ producto_id, producto: { id: producto_id, nombre, ...(seccion_ticket ? { seccion_ticket } : {}) } });

test('la carta del restaurante trae las entradas, los principales y el resto', () => {
  const carta = armarCartaRestaurante('2026-01-01');
  const de = nombre => carta.find(p => p.nombre === nombre).seccion_ticket;
  assert.equal(de('Empanadas'), 'entrada');
  assert.equal(de('Debresina con puré'), 'entrada');
  assert.equal(de('Matambre de cerdo'), 'principal');
  assert.equal(de('Ravioles'), 'principal');
  assert.equal(de('Tiramisú'), 'otro');
  assert.equal(de('Coca-Cola 350 cc'), 'otro');
});

test('los pedidos viejos sin el dato usan el de la carta o el del catálogo', () => {
  assert.equal(seccionDelProducto('rest-001', { id: 'rest-001', nombre: 'Empanadas' }), 'entrada');
  assert.equal(seccionDelProducto('prod-1', { id: 'prod-1' }, [{ id: 'prod-1', seccion_ticket: 'principal' }]), 'principal');
  assert.equal(seccionDelProducto('prod-2', { id: 'prod-2' }), 'otro');
  assert.equal(seccionDelProducto('rest-001', { id: 'rest-001', seccion_ticket: 'otro' }), 'otro');
});

test('las entradas salen primero y separadas de los platos principales', () => {
  const grupos = agruparPorSeccion([
    item('a', 'Coca', 'otro'),
    item('b', 'Bife', 'principal'),
    item('c', 'Provoleta', 'entrada'),
    item('d', 'Milanesa', 'principal'),
  ]);
  assert.deepEqual(grupos.map(g => [g.titulo, g.items.map(i => i.producto.nombre)]), [
    ['Entradas', ['Provoleta']],
    ['Platos principales', ['Bife', 'Milanesa']],
    ['Otros', ['Coca']],
  ]);
});

test('si no hay entradas ni principales el ticket sale como siempre', () => {
  const grupos = agruparPorSeccion([item('a', 'Café'), item('b', 'Medialuna')]);
  assert.deepEqual(grupos.map(g => g.titulo), [null]);
  assert.equal(htmlItemsPorSeccion([item('a', 'Café')], i => `<p>${i.producto.nombre}</p>`), '<p>Café</p>');
});
