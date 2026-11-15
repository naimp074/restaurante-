import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Gastos que quedaron solo como salida de plata (el servidor rechazó el gasto del cajero).
const compiled = await build({
  stdin: { contents: `export * from './src/lib/gastosRecuperables';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
});
const mod = new Module(path.resolve('tests/gastosRecuperables.compiled.cjs'));
mod.filename = path.resolve('tests/gastosRecuperables.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { gastosRecuperables } = mod.exports;

let n = 0;
const salida = (descripcion, monto, extra = {}) => ({
  id: `mov-${++n}`, fecha: '2026-11-15', tipo: 'salida', origen: 'gasto', cuenta_id: 'cuenta-caja-dia',
  monto, descripcion, metodo_pago: 'efectivo', created_at: `2026-11-15T19:0${n}:00Z`, creado_por: 'luciana', ...extra,
});
const gasto = (concepto, monto, extra = {}) => ({
  id: `g-${concepto}`, fecha: '2026-11-15', concepto, categoria: 'extra', alcance: 'caja_dia', metodo_pago: 'efectivo',
  monto, observaciones: '', created_at: '', cuenta_origen_id: 'cuenta-caja-dia', estado: 'pagado', ...extra,
});

test('encuentra las salidas que no tienen gasto y arma el gasto sin descontar otra vez', () => {
  const usuarios = [{ id: 'u-zoe', nombre: 'ZOE', apellido: '' }];
  const movs = [
    salida('Sueldo ZOE · 15/11/2026', 32000),
    salida('soda', 20000),
    salida('verdura', 69500),
    { ...salida('Venta mesa 3', 5000), tipo: 'entrada', origen: 'venta' },
  ];
  const lista = gastosRecuperables([gasto('verdura', 69500)], movs, usuarios);
  assert.deepEqual(lista.map(item => item.gasto.concepto), ['Sueldo ZOE · 15/11/2026', 'soda']);
  const [sueldo, soda] = lista.map(item => item.gasto);
  assert.equal(sueldo.categoria, 'sueldo');
  assert.equal(sueldo.empleado_id, 'u-zoe');
  assert.equal(sueldo.periodo, '2026-11');
  assert.equal(soda.categoria, 'extra');
  assert.equal(soda.alcance, 'caja_dia');
  assert.equal(soda.estado, 'pagado');
  assert.equal(soda.creado_por, 'luciana');
  assert.equal(soda.id, `gasto-recuperado-${movs[1].id}`);
});

test('no recupera gastos borrados o editados (la plata ya volvió)', () => {
  const movs = [
    salida('Luz', 1000),
    { ...salida('Anulacion de gasto: Luz', 1000), tipo: 'entrada', origen: 'ajuste', fecha: '2026-11-16' },
    salida('Gas', 2000),
    { ...salida('Edicion de gasto: Gas', 2000), tipo: 'entrada', origen: 'ajuste' },
    salida('Gas', 2500),
  ];
  assert.deepEqual(gastosRecuperables([gasto('Gas', 2500)], movs).map(item => item.gasto.concepto), []);
});

test('cuenta repetidos: dos salidas iguales y un solo gasto deja una para recuperar', () => {
  const movs = [salida('soda', 20000), salida('soda', 20000)];
  assert.equal(gastosRecuperables([gasto('soda', 20000)], movs).length, 1);
});

test('reconoce las partes de un gasto mixto y las compras', () => {
  const mixto = gasto('Arreglo', 3000, {
    metodo_pago: 'mixto',
    pagos_divididos: [
      { metodo_pago: 'efectivo', cuenta_id: 'cuenta-caja-dia', monto: 1000 },
      { metodo_pago: 'transferencia', cuenta_id: 'cuenta-banco', monto: 2000 },
    ],
  });
  const compra = gasto('Compra carne', 9000, { compra_id: 'c1', monto_pagado: 4000, cuenta_origen_id: 'cuenta-banco' });
  const movs = [
    salida('Arreglo (Efectivo)', 1000),
    salida('Arreglo (Transferencia)', 2000, { cuenta_id: 'cuenta-banco', metodo_pago: 'transferencia' }),
    salida('Compra carne', 4000, { cuenta_id: 'cuenta-banco' }),
  ];
  assert.equal(gastosRecuperables([mixto, compra], movs).length, 0);
});
