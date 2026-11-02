import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/* Paso de las categorías de la carta a S-CAFETERÍA, S-BAR y S-RESTAURANTE. */
const compiled = await build({
  stdin: {
    contents: `
      export { pasarATresCategorias, tieneCategoriasViejas } from './src/lib/reorganizarCategorias.ts';
      export { categoriasIniciales } from './src/lib/mockData.ts';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const archivo = path.resolve('tests/categorias.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod._compile(compiled.outputFiles[0].text, archivo);
const { pasarATresCategorias, tieneCategoriasViejas, categoriasIniciales } = mod.exports;

const producto = (nombre, categoria_id) => ({ id: nombre, nombre, categoria_id, precio_venta: 1000, updated_at: 'antes' });

test('hay solo tres categorías', () => {
  assert.deepEqual(categoriasIniciales.map(c => c.nombre), ['S-CAFETERÍA', 'S-BAR', 'S-RESTAURANTE']);
});

test('toda la carta va a S-CAFETERÍA y conserva el resto de los datos', () => {
  const viejas = Array.from({ length: 14 }, (_, i) => producto(`P${i}`, `cat-${i + 1}`));
  const pasados = pasarATresCategorias(viejas, 'ahora');
  assert.ok(pasados.every(p => p.categoria_id === 's-cafeteria' && p.categoria.nombre === 'S-CAFETERÍA'));
  assert.ok(pasados.every(p => p.precio_venta === 1000 && p.updated_at === 'ahora'));
  assert.equal(pasados.length, 14);
});

test('lo que no es de las categorías viejas no se toca y repetirlo no cambia nada', () => {
  const propio = producto('Propio', 'cat-mio');
  assert.equal(pasarATresCategorias([propio])[0], propio);
  const pasados = pasarATresCategorias([producto('Café', 'cat-2')]);
  assert.equal(tieneCategoriasViejas(pasados), false);
  assert.equal(pasarATresCategorias(pasados)[0], pasados[0]);
});
