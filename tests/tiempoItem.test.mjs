import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Reloj de cada ítem de la comanda: desde que se pidió hasta que salió de cocina.
const compiled = await build({ stdin: { contents: `export * from './src/lib/tiempoItem';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('tests/tiempoItem.compiled.cjs'));
mod.filename = path.resolve('tests/tiempoItem.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const pedido = '2026-11-05T20:00:00.000Z';
const item = { created_at: pedido, updated_at: pedido, estado: 'pendiente' };
const en = minutos => new Date(Date.parse(pedido) + minutos * 60000).toISOString();

test('mientras no sale, el reloj corre', () => {
  assert.equal(api.segundosDeItem(item, Date.parse(en(7.5))), 450);
  assert.equal(api.salidaDeItem(item), undefined);
});

test('al marcarlo listo se guarda la hora y el reloj se frena', () => {
  const enCocina = api.conEstado(item, 'en_preparacion', en(2));
  const listo = api.conEstado(enCocina, 'listo', en(12));
  assert.equal(listo.listo_at, en(12));
  assert.equal(api.segundosDeItem(listo, Date.parse(en(60))), 720);
  const entregado = api.conEstado(listo, 'entregado', en(15));
  assert.equal(entregado.listo_at, en(12), 'entregarlo no cambia cuándo salió');
  assert.equal(entregado.entregado_at, en(15));
});

test('si se entrega sin pasar por listo, se frena al entregar', () => {
  const entregado = api.conEstado(item, 'entregado', en(9));
  assert.equal(api.segundosDeItem(entregado, Date.parse(en(60))), 540);
});

test('ítems viejos sin hora guardada usan la última modificación', () => {
  const viejo = { ...item, estado: 'listo', updated_at: en(20) };
  assert.equal(api.segundosDeItem(viejo, Date.parse(en(90))), 1200);
});

test('formato del reloj', () => {
  assert.equal(api.formatoReloj(65), '1:05');
  assert.equal(api.formatoReloj(0), '0:00');
  assert.equal(api.formatoReloj(3725), '1h 02m');
});
