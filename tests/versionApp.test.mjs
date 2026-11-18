import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export { esVersionNueva, textoVersion } from './src/lib/versionApp';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/versionApp.compiled.cjs'));
mod.filename = path.resolve('tests/versionApp.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { esVersionNueva, textoVersion } = mod.exports;

test('avisa versión nueva solo si el servidor publica otra distinta', () => {
  assert.equal(esVersionNueva('2026-11-18T22:00:00.000Z', '2026-11-17T10:00:00.000Z'), true);
  assert.equal(esVersionNueva('2026-11-18T22:00:00.000Z', '2026-11-18T22:00:00.000Z'), false);
  assert.equal(esVersionNueva('', '2026-11-18T22:00:00.000Z'), false, 'sin respuesta no recarga');
  assert.equal(esVersionNueva(undefined, '2026-11-18T22:00:00.000Z'), false);
  assert.equal(esVersionNueva('2026-11-18T22:00:00.000Z', ''), false, 'en desarrollo no recarga');
});

test('la versión se muestra como fecha corta', () => {
  assert.match(textoVersion('2026-11-18T22:10:00.000Z'), /18\/11/);
  assert.equal(textoVersion(''), 'desarrollo');
});
