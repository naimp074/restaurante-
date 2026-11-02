import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/* Empezar de cero: borra el historial y conserva la carta. Sin Supabase, con localStorage en memoria. */
const compiled = await build({
  entryPoints: ['src/lib/empezarDeCero.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});

let memoria;
globalThis.window = {
  localStorage: {
    getItem: clave => (memoria.has(clave) ? memoria.get(clave) : null),
    setItem: (clave, valor) => memoria.set(clave, String(valor)),
    removeItem: clave => memoria.delete(clave),
  },
  dispatchEvent: () => true,
};
globalThis.CustomEvent ??= class { constructor(type) { this.type = type; } };

const archivo = path.resolve('tests/empezarDeCero.compiled.cjs');
const mod = new Module(archivo);
mod.filename = archivo;
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, archivo);
const { empezarDeCero, copiaAntesDeEmpezar } = mod.exports;

const poner = (clave, valor) => memoria.set(clave, JSON.stringify(valor));
const leer = clave => JSON.parse(memoria.get(clave));

beforeEach(() => {
  memoria = new Map();
  poner('restaurant-productos', [{ id: 'carta-001', nombre: 'Café' }]);
  poner('restaurant-categorias', [{ id: 's-cafeteria' }]);
  poner('restaurant-usuarios', [{ id: 'u1' }]);
  poner('restaurant-listas-precios', [{ id: 'l1' }]);
  poner('restaurant-config-local', { nombre: 'Aroma' });
  poner('restaurant-sectores-mesas', [{ id: 'salon' }]);
  poner('restaurant-pagos', [{ id: 'p1' }]);
  poner('restaurant-demo-pedidos', [{ id: 'd1' }]);
  poner('restaurant-gastos', [{ id: 'g1' }]);
  poner('restaurant-proveedores', [{ id: 'pr1' }]);
  poner('restaurant-cuenta-corriente', { clientes: [{ id: 'c1' }], movimientos: [{ id: 'm1' }], version: 2 });
  poner('restaurant-mesas', [{ id: 'm1', nombre: 'M1', estado: 'ocupada' }]);
  poner('restaurant-cuentas-dinero', [{ id: 'cuenta-banco', nombre: 'Banco', saldo: 1295184.5 }]);
});

test('la carta y la configuración no se tocan', () => {
  const antes = ['restaurant-productos', 'restaurant-categorias', 'restaurant-usuarios', 'restaurant-listas-precios', 'restaurant-config-local', 'restaurant-sectores-mesas']
    .map(clave => [clave, memoria.get(clave)]);
  empezarDeCero();
  antes.forEach(([clave, valor]) => assert.equal(memoria.get(clave), valor, clave));
});

test('el historial queda vacío', () => {
  empezarDeCero();
  for (const clave of ['restaurant-pagos', 'restaurant-demo-pedidos', 'restaurant-gastos', 'restaurant-proveedores']) {
    assert.deepEqual(leer(clave), [], clave);
  }
});

test('la cuenta corriente queda vacía pero conserva su forma', () => {
  empezarDeCero();
  assert.deepEqual(leer('restaurant-cuenta-corriente'), { clientes: [], movimientos: [], version: 2 });
});

test('las mesas quedan libres y las cuentas de dinero en cero', () => {
  empezarDeCero();
  assert.deepEqual(leer('restaurant-mesas'), [{ id: 'm1', nombre: 'M1', estado: 'libre' }]);
  assert.deepEqual(leer('restaurant-cuentas-dinero'), [{ id: 'cuenta-banco', nombre: 'Banco', saldo: 0 }]);
});

test('la copia guarda lo que se va a borrar', () => {
  const copia = copiaAntesDeEmpezar();
  assert.deepEqual(copia['restaurant-pagos'], [{ id: 'p1' }]);
  assert.equal(copia['restaurant-cuentas-dinero'][0].saldo, 1295184.5);
  assert.equal(copia['restaurant-productos'], undefined);
});
