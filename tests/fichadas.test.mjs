import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Reloj del personal: entradas, salidas, cálculo por hora y pago desde la caja.
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/fichadas';
  export * from './src/lib/gastosStore';
  export * from './src/lib/finance';
  export * from './src/lib/cajaStore';
  export * from './src/lib/storeSync';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' } });
const mod = new Module(path.resolve('tests/fichadas.compiled.cjs'));
mod.filename = path.resolve('tests/fichadas.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const leer = clave => JSON.parse(storage.get(`restaurant-${clave}`) || 'null');
const juan = { id: 'emp-juan', nombre: 'Juan', apellido: 'Pérez', rol: 'cocina', activo: true, valor_hora: 3000, created_at: '', updated_at: '' };
const a = iso => new Date(iso);

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  } });
  storage.set('restaurant-config-local', JSON.stringify({ hora_corte: 0 }));
  api.resetStoreWriteMarks();
});

test('marca entrada y salida y calcula por los minutos exactos', () => {
  api.marcarEntrada(juan, 'Caja', a('2026-11-17T12:00:00Z'));
  assert.throws(() => api.marcarEntrada(juan, 'Caja', a('2026-11-17T12:05:00Z')), /ya está trabajando/);
  const turno = api.marcarSalida(juan, 'Caja', a('2026-11-17T20:30:00Z'));
  assert.equal(api.minutosDe(turno), 510);
  assert.equal(api.textoHoras(510), '8 h 30 min');
  assert.equal(api.montoDe([turno], juan), 25500);
  assert.equal(turno.valor_hora, 3000, 'guarda lo que ganaba al entrar');
  assert.throws(() => api.marcarSalida(juan, 'Caja', a('2026-11-17T21:00:00Z')), /no tiene marcada la entrada/);
});

test('si le suben el valor de la hora, los turnos ya hechos no cambian', () => {
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const turno = api.marcarSalida(juan, '', a('2026-11-17T14:00:00Z'));
  assert.equal(api.montoDe([turno], { ...juan, valor_hora: 5000 }), 6000);
});

test('entra con la caja de la mañana, sale a la noche: el pago lo descuenta la caja abierta ahora', () => {
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const turno = api.marcarSalida(juan, '', a('2026-11-17T20:00:00Z'));
  // La de la mañana ya se cerró; está abierta la de la noche.
  storage.set('restaurant-cajas-diarias', JSON.stringify([
    { id: 'manana', fecha: '2026-11-16', estado: 'cerrada', monto_esperado_efectivo: 90000, opened_at: '2026-11-16T11:00:00Z' },
    { id: 'noche', fecha: '2026-11-17', estado: 'abierta', monto_esperado_efectivo: 100000, opened_at: '2026-11-17T19:00:00Z' },
  ]));
  const gasto = api.pagarHoras({ usuario: juan, fichadaIds: [turno.id], monto: 24000, medio: 'caja_dia', creado_por: 'Caja' });
  assert.equal(gasto.categoria, 'sueldo');
  assert.equal(gasto.alcance, 'caja_dia');
  assert.equal(gasto.fecha, '2026-11-17');
  assert.equal(gasto.empleado_id, 'emp-juan');
  assert.match(gasto.concepto, /^Horas Juan Pérez · 8 h/);
  const cajas = leer('cajas-diarias');
  assert.equal(cajas.find(c => c.id === 'noche').monto_esperado_efectivo, 76000);
  assert.equal(cajas.find(c => c.id === 'manana').monto_esperado_efectivo, 90000);
  assert.equal(leer('fichadas')[0].gasto_id, gasto.id);
  assert.deepEqual(api.turnosSinPagar(api.loadFichadas(), juan.id, api.loadGastos()), []);
  assert.throws(() => api.pagarHoras({ usuario: juan, fichadaIds: [turno.id], monto: 24000, medio: 'caja_dia' }), /ya se pagó/);
});

test('desde la caja grande o por transferencia no toca el arqueo del día', () => {
  storage.set('restaurant-cajas-diarias', JSON.stringify([{ id: 'c1', fecha: '2026-11-17', estado: 'abierta', monto_esperado_efectivo: 100000, opened_at: '2026-11-17T11:00:00Z' }]));
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const t1 = api.marcarSalida(juan, '', a('2026-11-17T13:00:00Z'));
  const bancoAntes = api.loadCuentasDinero().find(c => c.id === api.cuentaBancoId).saldo;
  api.pagarHoras({ usuario: juan, fichadaIds: [t1.id], monto: 3000, medio: 'transferencia' });
  assert.equal(bancoAntes - api.loadCuentasDinero().find(c => c.id === api.cuentaBancoId).saldo, 3000);
  api.marcarEntrada(juan, '', a('2026-11-17T14:00:00Z'));
  const t2 = api.marcarSalida(juan, '', a('2026-11-17T15:00:00Z'));
  const gasto = api.pagarHoras({ usuario: juan, fichadaIds: [t2.id], monto: 3000, medio: 'caja_grande' });
  assert.equal(gasto.cuenta_origen_id, api.cuentaCajaGrandeId);
  assert.equal(leer('cajas-diarias')[0].monto_esperado_efectivo, 100000);
});

test('con la caja cerrada no deja pagar desde la caja del día', () => {
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const turno = api.marcarSalida(juan, '', a('2026-11-17T13:00:00Z'));
  assert.throws(() => api.pagarHoras({ usuario: juan, fichadaIds: [turno.id], monto: 3000, medio: 'caja_dia' }), /caja del día está cerrada/);
  assert.equal(api.loadGastos().length, 0);
  assert.equal(leer('fichadas')[0].gasto_id, undefined);
});

test('no paga un turno que sigue abierto', () => {
  const abierto = api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  assert.throws(() => api.pagarHoras({ usuario: juan, fichadaIds: [abierto.id], monto: 3000, medio: 'caja_grande' }), /Marcá la salida/);
});

test('si borran el pago en Gastos, las horas vuelven a quedar para pagar', () => {
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const turno = api.marcarSalida(juan, '', a('2026-11-17T13:00:00Z'));
  api.pagarHoras({ usuario: juan, fichadaIds: [turno.id], monto: 3000, medio: 'caja_grande' });
  api.saveGastos([]);
  assert.equal(api.turnosSinPagar(api.loadFichadas(), juan.id, api.loadGastos()).length, 1);
});

test('corregir: la salida va después de la entrada, sin pisar otro turno, y lo pagado no se toca', () => {
  api.marcarEntrada(juan, '', a('2026-11-17T12:00:00Z'));
  const t1 = api.marcarSalida(juan, '', a('2026-11-17T16:00:00Z'));
  api.marcarEntrada(juan, '', a('2026-11-17T18:00:00Z'));
  const t2 = api.marcarSalida(juan, '', a('2026-11-17T20:00:00Z'));
  const ahora = a('2026-11-17T22:00:00Z');
  assert.throws(() => api.corregirFichada(t1.id, { entrada: '2026-11-17T12:00:00Z', salida: '2026-11-17T11:00:00Z' }, 'X', ahora), /después de la entrada/);
  assert.throws(() => api.corregirFichada(t1.id, { entrada: '2026-11-17T12:00:00Z', salida: '2026-11-17T19:00:00Z' }, 'X', ahora), /superpone/);
  const corregida = api.corregirFichada(t1.id, { entrada: '2026-11-17T11:30:00Z', salida: '2026-11-17T16:00:00Z' }, 'Encargado', ahora);
  assert.equal(api.minutosDe(corregida), 270);
  assert.equal(corregida.corregido_por, 'Encargado');
  api.pagarHoras({ usuario: juan, fichadaIds: [t2.id], monto: 6000, medio: 'caja_grande' });
  assert.throws(() => api.corregirFichada(t2.id, { entrada: '2026-11-17T18:00:00Z', salida: '2026-11-17T21:00:00Z' }, 'X', ahora), /ya se pagó/);
  assert.throws(() => api.borrarFichada(t2.id), /ya se pagó/);
  api.borrarFichada(t1.id);
  assert.equal(api.loadFichadas().length, 1);
});
