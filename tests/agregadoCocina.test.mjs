import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Un agregado a una comanda ya entregada tiene que verse en cocina.
const compiled = await build({
  stdin: { contents: `export { estadoSegunCocina, enviarACocina } from './src/lib/cobroComanda'; export { resolverConflicto } from './src/lib/sync/conflictos';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/agregadoCocina.compiled.cjs'));
mod.filename = path.resolve('tests/agregadoCocina.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const item = (id, estado, extra = {}) => ({ id, producto_id: id, producto: { id, nombre: id }, cantidad: 1, precio_unitario: 100, subtotal: 100, estado, ...extra });
const pedido = (estado, items) => ({ id: 'p1', estado, mesa: { numero: 4 }, descuento: 0, recargo: 0, items, historial: [] });

test('una comanda "entregada" con un producto nuevo en cocina vuelve a estar en preparación', () => {
  assert.equal(api.estadoSegunCocina(pedido('entregado', [item('milanesa', 'entregado'), item('flan', 'pendiente')])), 'en_preparacion');
  assert.equal(api.estadoSegunCocina(pedido('entregado', [item('milanesa', 'entregado'), item('flan', 'listo')])), 'listo');
  assert.equal(api.estadoSegunCocina(pedido('entregado', [item('milanesa', 'entregado')])), 'entregado');
  // Lo cargado sin enviar no cuenta, y las comandas cerradas no se tocan.
  assert.equal(api.estadoSegunCocina(pedido('entregado', [item('milanesa', 'entregado'), item('flan', 'pendiente', { sin_enviar: true })])), 'entregado');
  assert.equal(api.estadoSegunCocina(pedido('cobrado', [item('flan', 'pendiente')])), 'cobrado');
});

test('cocina marca entregado mientras la moza manda un agregado: al juntar, cocina lo sigue viendo', () => {
  const base = pedido('en_preparacion', [item('milanesa', 'listo')]);
  // Tablet de cocina: entregó lo último, la comanda pasa a "entregado".
  const cocina = pedido('entregado', [item('milanesa', 'entregado')]);
  // Moza: agregó un flan y lo mandó a cocina.
  const conFlan = { ...base, items: [...base.items, item('flan', 'pendiente', { sin_enviar: true })] };
  const moza = api.enviarACocina(conFlan, { nombre: 'Ana' });
  assert.equal(moza.estado, 'en_preparacion');

  for (const [local, remoto] of [[moza, cocina], [cocina, moza]]) {
    const { valor } = api.resolverConflicto('restaurant-demo-pedidos', local, remoto, base);
    const junto = valor;
    assert.equal(junto.estado, 'en_preparacion');
    assert.deepEqual(junto.items.map(i => [i.id, i.estado]).sort(), [['flan', 'pendiente'], ['milanesa', 'entregado']]);
  }
});
