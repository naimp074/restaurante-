import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/* Alta de cuentas y pantallas por usuario, con datos en memoria: no se conecta a Supabase. */
const compiled = await build({
  stdin: {
    contents: `
      export { crearManejador, dominioCuentas as dominioFuncion } from './supabase/functions/usuarios/manejador.ts';
      export { dominioCuentas, emailParaEntrar, accesoDeCuenta, normalizarUsuario } from './src/lib/cuentaUsuario.ts';
      export { perfilVePagina, paginaInicialDe, paginasPorDefecto } from './src/lib/paginas.ts';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const archivo = path.resolve('tests/usuarios.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod._compile(compiled.outputFiles[0].text, archivo);
const { crearManejador, perfilVePagina, paginaInicialDe, paginasPorDefecto, dominioFuncion, dominioCuentas, emailParaEntrar, accesoDeCuenta, normalizarUsuario } = mod.exports;

const admin = { rol: 'admin', activo: true, local_id: 'local-1' };
let perfil, activados, borrados, resultadoCrear, falloActivar;

const handler = () => crearManejador({
  perfilDesdeSesion: async () => perfil,
  crearUsuario: async () => resultadoCrear,
  activarPerfil: async (id, localId, cuenta) => {
    if (falloActivar) throw new Error('falló');
    activados.push({ id, localId, cuenta });
  },
  borrarUsuario: async id => { borrados.push(id); },
});

const pedir = (cuerpo, { ruta = 'crear', jwt = 'token' } = {}) => handler()(new Request(`http://x/functions/v1/usuarios/${ruta}`, {
  method: 'POST',
  headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  body: JSON.stringify(cuerpo),
}));

const valida = { email: 'Ana@Gmail.com', password: 'clave1234', nombre: 'Ana', apellido: '', rol: 'moza', paginas: ['mesas'] };

beforeEach(() => {
  perfil = admin;
  activados = [];
  borrados = [];
  resultadoCrear = { id: 'nuevo-1' };
  falloActivar = false;
});

test('un admin crea una cuenta activa en su local', async () => {
  const respuesta = await pedir(valida);
  assert.equal(respuesta.status, 200);
  assert.equal(activados[0].localId, 'local-1');
  assert.equal(activados[0].cuenta.email, 'ana@gmail.com');
  assert.deepEqual(activados[0].cuenta.paginas, ['mesas']);
});

test('nadie que no sea admin activo puede crear cuentas', async () => {
  for (const otro of [{ ...admin, rol: 'encargado' }, { ...admin, activo: false }, { ...admin, local_id: null }, null]) {
    perfil = otro;
    assert.equal((await pedir(valida)).status, 403);
  }
  assert.equal((await pedir(valida, { jwt: '' })).status, 401);
  assert.equal(activados.length, 0);
});

test('rechaza datos inválidos', async () => {
  for (const cambio of [
    { email: 'sin-arroba' }, { password: 'corta' }, { nombre: ' ' }, { rol: 'dueño' },
    { paginas: [] }, { paginas: ['usuarios'] },
  ]) {
    assert.equal((await pedir({ ...valida, ...cambio })).status, 400, JSON.stringify(cambio));
  }
  assert.equal(activados.length, 0);
});

test('un admin nuevo no lleva lista de pantallas', async () => {
  await pedir({ ...valida, rol: 'admin', paginas: [] });
  assert.equal(activados[0].cuenta.paginas, null);
});

test('un email repetido se informa sin tocar nada', async () => {
  resultadoCrear = { error: 'Ya existe una cuenta con ese email.' };
  const respuesta = await pedir(valida);
  assert.equal(respuesta.status, 409);
  assert.equal((await respuesta.json()).error, 'Ya existe una cuenta con ese email.');
  assert.equal(borrados.length, 0);
});

test('si no se puede activar el perfil, se borra la cuenta recién creada', async () => {
  falloActivar = true;
  assert.equal((await pedir(valida)).status, 500);
  assert.deepEqual(borrados, ['nuevo-1']);
});

test('la lista de pantallas manda sobre el rol', () => {
  const moza = { rol: 'moza', paginas: ['reportes'] };
  assert.equal(perfilVePagina(moza, 'reportes'), true);
  assert.equal(perfilVePagina(moza, 'mesas'), false);
  assert.equal(paginaInicialDe(moza), 'reportes');
});

test('sin lista se usan las pantallas del rol y usuarios sigue siendo solo del admin', () => {
  assert.equal(perfilVePagina({ rol: 'moza' }, 'mesas'), true);
  assert.equal(perfilVePagina({ rol: 'moza' }, 'reportes'), false);
  assert.equal(perfilVePagina({ rol: 'encargado', paginas: ['usuarios'] }, 'usuarios'), false);
  assert.equal(perfilVePagina({ rol: 'admin', paginas: ['mesas'] }, 'usuarios'), true);
});

test('las pantallas por defecto de cada rol coinciden con lo que ya veía', () => {
  assert.ok(paginasPorDefecto('moza').includes('ventas'));
  assert.ok(!paginasPorDefecto('moza').includes('caja'));
  assert.deepEqual(paginasPorDefecto('cocina'), ['cocina']);
});

test('se crea la cuenta solo con un usuario, sin email', async () => {
  const { email, ...sinEmail } = valida;
  const respuesta = await pedir({ ...sinEmail, usuario: 'Juan Pérez' });
  assert.equal(respuesta.status, 200);
  assert.equal(activados[0].cuenta.email, `juan.perez@${dominioCuentas}`);
});

test('rechaza un usuario muy corto o con símbolos', async () => {
  const { email, ...sinEmail } = valida;
  for (const usuario of ['jo', 'juan!', '']) {
    const respuesta = await pedir({ ...sinEmail, usuario });
    assert.equal(respuesta.status, 400, usuario);
  }
  assert.equal(activados.length, 0);
});

test('el login con usuario llega al mismo email interno que creó la función', () => {
  assert.equal(dominioFuncion, dominioCuentas);
  assert.equal(emailParaEntrar('  Juan '), `juan@${dominioCuentas}`);
  assert.equal(emailParaEntrar('Ana@Gmail.com'), 'ana@gmail.com');
  assert.equal(accesoDeCuenta(`juan@${dominioCuentas}`), 'juan');
  assert.equal(accesoDeCuenta('ana@gmail.com'), 'ana@gmail.com');
  assert.equal(normalizarUsuario('María José'), 'maria.jose');
});
