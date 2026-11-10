import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Plano de mesas: estado que se ve en cada mesa, ubicación automática y planos de referencia.
const compiled = await build({
  stdin: {
    contents: `export * from './src/lib/estadoMesa'; export * from './src/lib/planoMesas'; export { plantillasPlano } from './src/lib/plantillasPlano';`,
    resolveDir: process.cwd(),
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/planoMesas.compiled.cjs'));
mod.filename = path.resolve('tests/planoMesas.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const ahora = '2026-11-08T21:00:00.000Z';
const mesa = (numero, extra = {}) => ({
  id: `m${numero}`, numero, capacidad: 4, estado: 'libre', sector: 'salon',
  posicion_x: 0, posicion_y: 0, activa: true, created_at: ahora, updated_at: ahora, ...extra,
});
const item = (estado, extra = {}) => ({ id: `i-${Math.random()}`, estado, cantidad: 1, subtotal: 100, ...extra });
const pedido = (mesaId, estado, items = [], extra = {}) => ({
  id: `p-${mesaId}`, mesa_id: mesaId, estado, items, total: 100, cantidad_personas: 2,
  hora_apertura: ahora, created_at: ahora, ...extra,
});

test('sin comanda abierta la mesa está libre; fuera de servicio, cerrada', () => {
  assert.equal(api.estadoVisualMesa(mesa(1), []), 'libre');
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'cobrado', [item('entregado')])]), 'libre');
  assert.equal(api.estadoVisualMesa(mesa(1, { estado: 'cerrada' }), [pedido('m1', 'abierto')]), 'cerrada');
});

test('el color sigue a la comanda: ocupada, esperando, en cocina, servida', () => {
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'abierto')]), 'ocupada');
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'abierto', [item('pendiente')])]), 'esperando_pedido');
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'en_preparacion', [item('pendiente')])]), 'en_preparacion');
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'listo', [item('listo')])]), 'en_preparacion');
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'entregado', [item('entregado')])]), 'servida');
  // Ya servida, cargan un postre y todavía no lo mandaron.
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'entregado', [item('entregado'), item('pendiente')])]), 'esperando_pedido');
  // Los cancelados no cuentan.
  assert.equal(api.estadoVisualMesa(mesa(1), [pedido('m1', 'abierto', [item('cancelado')])]), 'ocupada');
});

test('pidió la cuenta: pendiente de cobro hasta que se cobra', () => {
  const conCuenta = pedido('m1', 'entregado', [item('entregado')], { cuenta_pedida_at: ahora });
  assert.equal(api.estadoVisualMesa(mesa(1), [conCuenta]), 'pendiente_cobro');
  assert.equal(api.estadoVisualMesa(mesa(1), [{ ...conCuenta, estado: 'cobrado' }]), 'libre');
});

test('dos mesas dibujadas juntas tienen cada una su estado', () => {
  const pedidos = [pedido('m1', 'abierto', [item('pendiente')])];
  assert.equal(api.estadoVisualMesa(mesa(1), pedidos), 'esperando_pedido');
  assert.equal(api.estadoVisualMesa(mesa(2), pedidos), 'libre');
});

test('un pedido sin mesa (delivery) no ocupa ninguna mesa', () => {
  assert.equal(api.pedidoAbiertoDeMesa('', [pedido('', 'abierto')]), undefined);
});

test('las mesas sin lugar se ubican solas, sin encimarse ni salirse del plano', () => {
  const plano = api.planoPorDefecto();
  const mesas = Array.from({ length: 30 }, (_, i) => mesa(i + 1));
  const layouts = api.layoutsDelSector(mesas, plano);
  assert.equal(layouts.size, 30);
  const lista = [...layouts.values()];
  lista.forEach(l => {
    assert.ok(l.x >= 0 && l.x <= plano.ancho && l.y >= 0 && l.y <= plano.alto);
  });
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      const a = lista[i]; const b = lista[j];
      assert.ok(Math.abs(a.x - b.x) >= a.ancho || Math.abs(a.y - b.y) >= a.alto, `se enciman ${i} y ${j}`);
    }
  }
});

test('lo guardado se respeta y las nuevas esquivan a las ubicadas', () => {
  const plano = api.planoPorDefecto();
  const fija = mesa(1, { plano: { x: 70, y: 70, ancho: 64, alto: 64, rotacion: 0, forma: 'cuadrada' } });
  const layouts = api.layoutsDelSector([fija, mesa(2)], plano);
  assert.deepEqual(layouts.get('m1'), fija.plano);
  const nueva = layouts.get('m2');
  assert.ok(nueva.x !== 70 || nueva.y !== 70);
});

test('un plano guardado roto vuelve a valores seguros', () => {
  assert.deepEqual(api.planoValido(undefined).elementos, []);
  const plano = api.planoValido({ ancho: 'x', alto: 50, elementos: [{ id: 'a', x: 1 }] });
  assert.equal(plano.ancho, 1000);
  assert.equal(plano.alto, 700);
  assert.equal(plano.elementos.length, 0);
});

test('el plano de referencia del salón ubica las mesas que existen y avisa las que faltan', () => {
  const salon = api.plantillasPlano.find(p => p.id === 'salon-principal');
  const numeros = salon.mesas.map(m => m.ref);
  assert.deepEqual(numeros.filter(n => typeof n === 'number').sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.ok(numeros.includes('Box 1') && numeros.includes('Box 2'));

  const mesas = [
    mesa(1), mesa(2), mesa(19),
    mesa(24, { sector: 'terraza' }),
    mesa(99),
    mesa(30, { id: 'box1', nombre: 'Box 1' }),
  ];
  const analisis = api.analizarPlantilla(salon, 'salon', mesas);
  assert.deepEqual(analisis.enSector.map(x => x.mesa.id).sort(), ['box1', 'm1', 'm19', 'm2']);
  assert.deepEqual(analisis.enOtroSector.map(x => x.mesa.id), ['m24']);
  assert.deepEqual(analisis.sobrantes.map(m => m.id), ['m99']);
  assert.equal(analisis.faltantes.length, salon.mesas.length - 5);
  // Las que van juntas quedan pegadas: 1 y 2 comparten un lado.
  const uno = analisis.enSector.find(x => x.mesa.id === 'm1').layout;
  const dos = analisis.enSector.find(x => x.mesa.id === 'm2').layout;
  assert.equal(dos.x - uno.x, uno.ancho);
  assert.equal(uno.y, dos.y);
});

test('vereda y sector 31-43 traen exactamente las mesas pedidas', () => {
  const vereda = api.plantillasPlano.find(p => p.id === 'vereda').mesas.map(m => m.ref).sort((a, b) => a - b);
  assert.deepEqual(vereda, [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64]);
  const sector = api.plantillasPlano.find(p => p.id === 'sector-31-43').mesas.map(m => m.ref).sort((a, b) => a - b);
  assert.deepEqual(sector, Array.from({ length: 13 }, (_, i) => i + 31));
});

test('si el número se repite en dos apartados, gana el del apartado que se arma', () => {
  const vereda = api.plantillasPlano.find(p => p.id === 'vereda');
  const analisis = api.analizarPlantilla(vereda, 'vereda', [mesa(50, { id: 'a', sector: 'salon' }), mesa(50, { id: 'b', sector: 'vereda' })]);
  assert.deepEqual(analisis.enSector.map(x => x.mesa.id), ['b']);
  assert.equal(analisis.enOtroSector.length, 0);
});
