import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/* Las líneas del comprobante fiscal: por categoría, sin productos, y sumando el total exacto. */
const compiled = await build({
  entryPoints: ['src/lib/lineasFiscales.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const archivo = path.resolve('tests/lineasFiscales.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod._compile(compiled.outputFiles[0].text, archivo);
const { lineasPorCategoria } = mod.exports;

const categorias = [{ id: 'c', nombre: 'S-CAFETERÍA' }, { id: 'b', nombre: 'S-BAR' }, { id: 'r', nombre: 'S-RESTAURANTE' }];
const catalogo = [{ id: 'cafe', categoria_id: 'c' }, { id: 'medialuna', categoria_id: 'c' }, { id: 'gin', categoria_id: 'b' }, { id: 'pizza', categoria_id: 'r' }];
const item = (producto_id, subtotal, estado = 'servido') => ({ producto_id, subtotal, estado });
const suma = lineas => Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;

test('agrupa por categoría y no nombra productos', () => {
  const lineas = lineasPorCategoria([item('cafe', 1000), item('medialuna', 500), item('pizza', 2000)], 3500, catalogo, categorias);
  assert.deepEqual(lineas, [{ nombre: 'S-CAFETERÍA', subtotal: 1500 }, { nombre: 'S-RESTAURANTE', subtotal: 2000 }]);
});

test('una sola categoría lleva todo el total', () => {
  assert.deepEqual(lineasPorCategoria([item('gin', 7500)], 7500, catalogo, categorias), [{ nombre: 'S-BAR', subtotal: 7500 }]);
});

test('con descuento o recargo suma justo el total facturado', () => {
  const items = [item('cafe', 1000), item('gin', 1000), item('pizza', 1000)];
  for (const total of [2700, 3300, 1000.01, 2999.99]) {
    assert.equal(suma(lineasPorCategoria(items, total, catalogo, categorias)), total);
  }
});

test('ignora lo cancelado', () => {
  const lineas = lineasPorCategoria([item('cafe', 1000), item('pizza', 2000, 'cancelado')], 1000, catalogo, categorias);
  assert.deepEqual(lineas, [{ nombre: 'S-CAFETERÍA', subtotal: 1000 }]);
});

test('un producto borrado usa su copia, y sin categoría dice Consumo', () => {
  const borrado = { ...item('viejo', 100), producto: { categoria_id: 'b' } };
  assert.equal(lineasPorCategoria([borrado], 100, catalogo, categorias)[0].nombre, 'S-BAR');
  assert.equal(lineasPorCategoria([item('otro', 100)], 100, catalogo, categorias)[0].nombre, 'Consumo');
});

test('sin consumo no hay líneas', () => {
  assert.deepEqual(lineasPorCategoria([], 1000, catalogo, categorias), []);
});
