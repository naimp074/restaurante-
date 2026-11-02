import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/* Carta del restaurante: se suma a S-RESTAURANTE sin tocar lo que ya hay. */
const compiled = await build({
  entryPoints: ['src/lib/cartaRestaurante.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const archivo = path.resolve('tests/cartaRestaurante.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod._compile(compiled.outputFiles[0].text, archivo);
const { armarCartaRestaurante, agregarCartaRestaurante, cartaRestauranteCargada } = mod.exports;

const carta = armarCartaRestaurante('ahora');
const precio = nombre => carta.find(p => p.nombre === nombre)?.precio_venta;

test('están todos los platos, a la venta y en S-RESTAURANTE', () => {
  assert.equal(carta.length, 192);
  assert.ok(carta.every(p => p.categoria_id === 's-restaurante' && p.categoria.nombre === 'S-RESTAURANTE'));
  assert.ok(carta.every(p => p.disponible && p.precio_venta > 0));
});

test('no hay nombres ni ids repetidos', () => {
  assert.equal(new Set(carta.map(p => p.nombre.toLowerCase())).size, carta.length);
  assert.equal(new Set(carta.map(p => p.id)).size, carta.length);
});

test('una y dos porciones tienen su precio', () => {
  assert.equal(precio('Tira de asado (1 porción)'), 25000);
  assert.equal(precio('Tira de asado (2 porciones)'), 45000);
  assert.equal(precio('Milanesa (1 porción)'), 22000);
  assert.equal(precio('Milanesa (2 porciones)'), 40000);
  assert.equal(precio('Picana'), 33000);
});

test('agregarla no toca lo que ya hay y repetirla no duplica', () => {
  const previo = { id: 'carta-001', nombre: 'Café', precio_venta: 100 };
  const una = agregarCartaRestaurante([previo], 'ahora');
  assert.equal(una[0], previo);
  assert.equal(una.length, 193);
  assert.equal(cartaRestauranteCargada([previo]), false);
  assert.equal(cartaRestauranteCargada(una), true);
  assert.equal(agregarCartaRestaurante(una, 'despues').length, 193);
});
