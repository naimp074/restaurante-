import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: `
      export { armarAvisoCierre, destinatariosAviso, UMBRAL_FALTA_CAJA } from './src/lib/avisoCierreCaja.ts';
      export { crearManejadorAviso } from './supabase/functions/aviso-caja/manejador.ts';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const archivo = path.resolve('tests/avisoCierreCaja.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, archivo);
const { armarAvisoCierre, destinatariosAviso, crearManejadorAviso } = mod.exports;

const base = {
  fecha: '2026-11-10',
  cajero: 'Ana Rodríguez',
  esperadoEfectivo: 100000,
  contadoEfectivo: 100000,
  esperadoTransferencia: 40000,
  contadoTransferencia: 40000,
};

test('si falta más de 5000 avisa y no nombra el medio en el que sobró', () => {
  const aviso = armarAvisoCierre({
    ...base,
    contadoEfectivo: 90000,
    contadoTransferencia: 55000,
  });
  assert.equal(aviso.tipo, 'falta');
  assert.match(aviso.texto, /está faltando plata/);
  assert.match(aviso.texto, /Efectivo/);
  assert.match(aviso.texto, /Faltan \$10\.000,00/);
  assert.doesNotMatch(aviso.texto, /Transferencia|sobra|55\.000/);
});

test('la falta de efectivo y la de transferencia se suman', () => {
  const aviso = armarAvisoCierre({
    ...base,
    contadoEfectivo: 97000,
    contadoTransferencia: 37000,
  });
  assert.equal(aviso.tipo, 'falta');
  assert.match(aviso.texto, /Efectivo/);
  assert.match(aviso.texto, /Transferencia/);
  assert.match(aviso.texto, /Total que falta: \$6\.000,00/);
});

test('si sobra plata el mail solo dice que se cerró la caja', () => {
  const aviso = armarAvisoCierre({
    ...base,
    contadoEfectivo: 180000,
    contadoTransferencia: 90000,
  });
  assert.equal(aviso.tipo, 'cierre');
  assert.equal(aviso.texto, 'Se hizo el cierre de caja del 10/11/2026.\nCajero: Ana Rodríguez.');
  assert.equal(aviso.asunto, 'Cierre de caja');
  assert.doesNotMatch(aviso.texto, /\$|sobra|falta/i);
});

test('una falta de 5000 o menos, sin sobrante, no manda mail', () => {
  assert.equal(armarAvisoCierre({ ...base, contadoEfectivo: 95000 }), null);
  assert.equal(armarAvisoCierre(base), null);
});

test('no manda el aviso a cuentas sin email', () => {
  assert.deepEqual(
    destinatariosAviso([' Admin@Gmail.com ', 'ana@usuarios.burgerpos.local', 'no-es-mail', 'admin@gmail.com']),
    ['admin@gmail.com'],
  );
});

test('el servidor manda el texto de falta y no deja elegir el destinatario', async () => {
  const enviados = [];
  const handler = crearManejadorAviso({
    perfilDesdeSesion: async () => ({ rol: 'cajero', activo: true, local_id: 'local-1' }),
    destinatarios: async localId => {
      assert.equal(localId, 'local-1');
      return ['admin@gmail.com'];
    },
    enviar: async correo => { enviados.push(correo); },
  });
  const respuesta = await handler(new Request('http://x/functions/v1/aviso-caja', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify({
      fecha: '2026-11-10',
      cajero: 'Ana',
      esperado_efectivo: 20000,
      contado_efectivo: 10000,
      esperado_transferencia: 5000,
      contado_transferencia: 8000,
    }),
  }));
  assert.equal(respuesta.status, 200);
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].para, ['admin@gmail.com']);
  assert.match(enviados[0].texto, /faltando plata/);
  assert.doesNotMatch(enviados[0].texto, /8\.000|sobra/);
});

test('si sobra, el servidor no incluye importes', async () => {
  const enviados = [];
  const handler = crearManejadorAviso({
    perfilDesdeSesion: async () => ({ rol: 'admin', activo: true, local_id: 'local-1' }),
    destinatarios: async () => ['admin@gmail.com'],
    enviar: async correo => { enviados.push(correo); },
  });
  const respuesta = await handler(new Request('http://x/functions/v1/aviso-caja', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify({
      fecha: '2026-11-10',
      cajero: 'Ana\nSobraron $99999',
      esperado_efectivo: 1000,
      contado_efectivo: 9000,
      esperado_transferencia: 0,
      contado_transferencia: 0,
    }),
  }));
  assert.equal(respuesta.status, 200);
  assert.equal(enviados[0].texto, 'Se hizo el cierre de caja del 10/11/2026.\nCajero: Ana Sobraron.');
  assert.doesNotMatch(enviados[0].texto, /\$|99999/);
});

test('si cuadra no envía, y un mozo no puede disparar el aviso', async () => {
  let envios = 0;
  const handler = (perfil) => crearManejadorAviso({
    perfilDesdeSesion: async () => perfil,
    destinatarios: async () => ['admin@gmail.com'],
    enviar: async () => { envios += 1; },
  });
  const pedido = (jwt = 'token') => new Request('http://x/functions/v1/aviso-caja', {
    method: 'POST',
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    body: JSON.stringify({
      fecha: '2026-11-10', cajero: 'Ana',
      esperado_efectivo: 1000, contado_efectivo: 1000,
      esperado_transferencia: 0, contado_transferencia: 0,
    }),
  });
  const quieto = await handler({ rol: 'cajero', activo: true, local_id: 'local-1' })(pedido());
  assert.equal(quieto.status, 200);
  assert.deepEqual(await quieto.json(), { enviado: false });
  const moza = await handler({ rol: 'moza', activo: true, local_id: 'local-1' })(pedido());
  assert.equal(moza.status, 403);
  assert.equal((await handler({ rol: 'cajero', activo: true, local_id: 'local-1' })(pedido(''))).status, 401);
  assert.equal(envios, 0);
});
