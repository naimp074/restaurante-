import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/finance.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const service = new Module(path.resolve('tests/comprasGastos.compiled.cjs'));
service.filename = path.resolve('tests/comprasGastos.compiled.cjs');
service.paths = Module._nodeModulePaths(process.cwd());
service._compile(compiled.outputFiles[0].text, service.filename);
const { registrarGastoCompra, registrarPagoProveedor } = service.exports;
let storage;
const now = new Date();
const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const get = key => JSON.parse(storage.get(`restaurant-${key}`) || '[]');
const args = (overrides = {}) => ({
  compra_id: 'compra-1', proveedor_id: 'proveedor-1', fecha, concepto: 'Compra de stock: Harina (10 kilos)',
  observaciones: '', total: 8500, monto_pagado: 0, cuenta_origen_id: 'cuenta-caja-grande', metodo_pago: 'efectivo', ...overrides,
});
beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  storage.set('restaurant-cuentas-dinero', JSON.stringify([
    { id: 'cuenta-caja-grande', nombre: 'Caja grande', tipo: 'efectivo', saldo: 20000, activa: true },
    { id: 'cuenta-caja-dia', nombre: 'Caja del día', tipo: 'efectivo', saldo: 10000, saldo_fecha: fecha, activa: true },
  ]));
  storage.set('restaurant-cajas-diarias', JSON.stringify([
    { id: 'caja-1', fecha, estado: 'abierta', monto_inicial: 0, monto_esperado_efectivo: 10000 },
  ]));
});

test('compra pendiente aparece como gasto de hoy sin descontar dinero', () => {
  registrarGastoCompra(args());
  const [gasto] = get('gastos');
  assert.equal(gasto.fecha, fecha);
  assert.equal(gasto.monto, 8500);
  assert.equal(gasto.categoria, 'variable');
  assert.equal(gasto.estado, 'pendiente');
  assert.equal(gasto.factura_proveedor_id, get('facturas-proveedor')[0].id);
  assert.equal(get('movimientos-financieros').length, 0);
  assert.equal(get('cuentas-dinero')[0].saldo, 20000);
});

test('compra pagada registra gasto, factura y un solo débito; repetir no duplica', () => {
  registrarGastoCompra(args({ monto_pagado: 8500 }));
  registrarGastoCompra(args({ monto_pagado: 8500 }));
  assert.equal(get('gastos').length, 1);
  assert.equal(get('gastos')[0].estado, 'pagado');
  assert.equal(get('facturas-proveedor').length, 1);
  assert.equal(get('facturas-proveedor')[0].pagado, 8500);
  assert.equal(get('pagos-proveedor').length, 1);
  assert.equal(get('movimientos-financieros').length, 1);
  assert.equal(get('cuentas-dinero')[0].saldo, 11500);
});

test('pago parcial conserva total y al saldar al proveedor actualiza el mismo gasto', () => {
  registrarGastoCompra(args({ monto_pagado: 2000 }));
  const [gasto] = get('gastos');
  assert.equal(gasto.monto, 8500);
  assert.equal(gasto.monto_pagado, 2000);
  assert.equal(gasto.estado, 'pendiente');
  registrarPagoProveedor({ proveedor_id: 'proveedor-1', factura_id: gasto.factura_proveedor_id,
    cuenta_origen_id: 'cuenta-caja-grande', metodo_pago: 'efectivo', monto: 6500, fecha });
  assert.equal(get('gastos').length, 1);
  assert.equal(get('gastos')[0].monto_pagado, 8500);
  assert.equal(get('gastos')[0].estado, 'pagado');
  assert.equal(get('cuentas-dinero')[0].saldo, 11500);
});

test('compra sin proveedor también genera gasto y descuenta lo pagado', () => {
  registrarGastoCompra(args({ proveedor_id: undefined, monto_pagado: 8500 }));
  assert.equal(get('gastos')[0].estado, 'pagado');
  assert.equal(get('facturas-proveedor').length, 0);
  assert.equal(get('movimientos-financieros').length, 1);
  assert.equal(get('cuentas-dinero')[0].saldo, 11500);
});

test('pendiente sin proveedor conserva la fecha elegida y no genera salida', () => {
  registrarGastoCompra(args({ proveedor_id: undefined, fecha: '2026-09-01' }));
  assert.equal(get('gastos')[0].fecha, '2026-09-01');
  assert.equal(get('gastos')[0].estado, 'pendiente');
  assert.equal(get('movimientos-financieros').length, 0);
});

for (const proveedor_id of ['proveedor-1', undefined]) {
  test(`pago desde caja del día ajusta efectivo una vez, proveedor=${proveedor_id}`, () => {
    registrarGastoCompra(args({ proveedor_id, monto_pagado: 2000, cuenta_origen_id: 'cuenta-caja-dia' }));
    assert.equal(get('cuentas-dinero')[1].saldo, 8000);
    assert.equal(get('cajas-diarias')[0].monto_esperado_efectivo, 8000);
    assert.equal(get('movimientos-financieros').length, 1);
  });
}

test('pago sin cuenta válida se rechaza antes de generar registros', () => {
  assert.throws(() => registrarGastoCompra(args({ monto_pagado: 8500, cuenta_origen_id: undefined })), /cuenta de origen/);
  assert.equal(get('gastos').length, 0);
  assert.equal(get('facturas-proveedor').length, 0);
  assert.equal(get('movimientos-financieros').length, 0);
});
