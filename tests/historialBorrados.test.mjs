import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Historial de borrados: qué se borró, quién y cuándo.
const compiled = await build({ stdin: { contents: `export * from './src/lib/historialBorrados';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('tests/historialBorrados.compiled.cjs'));
mod.filename = path.resolve('tests/historialBorrados.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const fila = (extra) => ({ clave: 'restaurant-productos', registro_id: '#prod-1', payload: null, updated_at: '2026-11-19T02:36:09Z', updated_by: 'ori', ...extra });

test('un borrado masivo de una misma persona en el mismo minuto se ve como uno', () => {
  const filas = [
    ...Array.from({ length: 300 }, (_, i) => fila({ registro_id: `#prod-${i}`, updated_at: `2026-11-19T02:36:${String(i % 60).padStart(2, '0')}Z` })),
    fila({ clave: 'restaurant-pagos', registro_id: '#pago-1', updated_at: '2026-11-18T23:47:00Z' }),
    fila({ updated_by: 'daniela', updated_at: '2026-11-18T23:47:00Z' }),
  ];
  const grupos = api.agruparBorrados(filas);
  assert.equal(grupos.length, 3);
  assert.equal(grupos[0].filas.length, 300);
  assert.equal(grupos[0].quien, 'ori');
  assert.equal(grupos[2].quien, 'daniela');
});

test('describe lo borrado con lo que tenga', () => {
  assert.equal(api.describirBorrado(fila({ payload: { codigo: 'REST-057', nombre: 'Suprema a la Kiev', precio_venta: 28000 } })), 'REST-057 · Suprema a la Kiev · $28.000');
  assert.equal(api.describirBorrado(fila({ payload: { total_cobrado: 35000, pedido: { mesa: { numero: 54 } } } })), 'Mesa 54 · $35.000');
  assert.match(api.describirBorrado(fila({ payload: null })), /prod-1 \(borrado antes de que se guardara el contenido\)/);
  assert.equal(api.nombreClave('restaurant-pagos'), 'Cobros');
});
