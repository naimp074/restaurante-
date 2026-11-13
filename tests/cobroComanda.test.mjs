import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Cobro de comandas en dos manos (moza pide, caja cobra) y edición de comandas ya enviadas.
const compiled = await build({
  stdin: { contents: `export * from './src/lib/cobroComanda'; export * from './src/lib/estadoMesa';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/cobroComanda.compiled.cjs'));
mod.filename = path.resolve('tests/cobroComanda.compiled.cjs');
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

const t0 = '2026-11-10T21:00:00.000Z';
const moza = { id: 'u-moza', nombre: 'Ana Pérez', rol: 'moza' };
const cajero = { id: 'u-caja', nombre: 'Caja Uno', rol: 'cajero' };
const encargado = { id: 'u-enc', nombre: 'Encargado', rol: 'encargado' };

const item = (id, estado, cantidad, precio, extra = {}) => ({
  id, pedido_id: 'ped-1', producto_id: `prod-${id}`, cantidad, precio_unitario: precio, subtotal: cantidad * precio,
  observaciones: '', estado, created_at: t0, updated_at: t0, producto: { nombre: `Desayuno ${id}` }, ...extra,
});

// Mesa M2: tres desayunos entregados, $14.190.
const mesaM2 = (extra = {}) => ({
  id: 'ped-1', mesa_id: 'mesa-2', cantidad_personas: 3, estado: 'entregado', subtotal: 14190, descuento: 0, recargo: 0, total: 14190,
  observaciones: '', hora_apertura: t0, created_at: t0, updated_at: t0,
  items: [item('a', 'entregado', 1, 4730), item('b', 'entregado', 1, 4730), item('c', 'entregado', 1, 4730)],
  ...extra,
});

test('entregada no es pagada: arranca pendiente de cobro', () => {
  const pedido = mesaM2();
  assert.equal(api.estadoCobro(pedido), 'pendiente');
  assert.equal(api.estadoDePedido(pedido), 'servida');
  assert.equal(api.itemsSinEnviar(pedido).length, 0);
});

test('la moza pide el cobro: no cierra la comanda y la mesa pasa a pendiente de cobro', () => {
  const pedido = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  assert.equal(pedido.estado, 'entregado', 'pedir el cobro no la marca cobrada');
  assert.equal(pedido.solicitud_cobro.estado, 'solicitado');
  assert.equal(pedido.solicitud_cobro.total, 14190);
  assert.equal(pedido.solicitud_cobro.metodo_pago, 'efectivo');
  assert.equal(pedido.solicitud_cobro.solicitada_por_nombre, 'Ana Pérez');
  assert.equal(api.estadoDePedido(pedido), 'pendiente_cobro');
  assert.equal(pedido.historial.at(-1).tipo, 'cobro_solicitado');
});

test('no se puede pedir el cobro dos veces ni con cosas sin enviar', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  assert.throws(() => api.nuevaSolicitud(pedida, 'efectivo', moza), /ya tiene un pedido de cobro/);
  const conNuevo = mesaM2({ items: [...mesaM2().items, item('d', 'pendiente', 1, 1000, { sin_enviar: true })] });
  assert.throws(() => api.nuevaSolicitud(conNuevo, 'efectivo', moza), /sin enviar/);
  assert.throws(() => api.nuevaSolicitud(mesaM2({ items: [] }), 'efectivo', moza), /no tiene productos/);
  assert.throws(() => api.nuevaSolicitud(mesaM2({ estado: 'cobrado' }), 'efectivo', moza), /cerrada/);
});

test('con el cobro en caja la comanda no se puede modificar', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  assert.match(api.bloqueoEdicion(pedida), /Cancelalo/);
  const conTicket = api.marcarTicketEmitido(pedida, { total: 14190, descuento: 0, recargo: 0, metodo_pago: 'efectivo' }, cajero, t0);
  assert.match(api.bloqueoEdicion(conTicket), /caja tiene que anularlo/);
  assert.throws(() => api.cancelarSolicitud(conTicket, moza), /pedile que lo anule/);
});

test('la moza puede retirar la solicitud antes del ticket y volver a editar', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  const retirada = api.cancelarSolicitud(pedida, moza, t0);
  assert.equal(retirada.solicitud_cobro, undefined);
  assert.equal('solicitud_cobro' in retirada, false, 'no queda la clave vacía en la sync');
  assert.equal(api.bloqueoEdicion(retirada), null);
  assert.equal(retirada.historial.at(-1).tipo, 'cobro_cancelado');
});

test('caja imprime el ticket, lo anula y lo devuelve con motivo', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  const conTicket = api.marcarTicketEmitido(pedida, { total: 14190, descuento: 0, recargo: 0, metodo_pago: 'efectivo' }, cajero, t0);
  assert.equal(api.estadoCobro(conTicket), 'ticket_emitido');
  assert.deepEqual(api.importeFijado(conTicket), { total: 14190, descuento: 0, recargo: 0, metodo_pago: 'efectivo' });
  const anulado = api.anularTicket(conTicket, 'paga con débito', cajero, t0);
  assert.equal(anulado.solicitud_cobro.estado, 'solicitado');
  assert.equal(anulado.solicitud_cobro.ticket, undefined);
  assert.equal(api.importeFijado(anulado), null);
  assert.throws(() => api.rechazarSolicitud(anulado, '  ', cajero), /por qué/);
  const devuelta = api.rechazarSolicitud(anulado, 'falta la bebida', cajero, t0);
  assert.equal(api.estadoCobro(devuelta), 'rechazada');
  assert.equal(devuelta.solicitud_cobro.motivo_rechazo, 'falta la bebida');
  assert.equal(api.bloqueoEdicion(devuelta), null, 'devuelta, la moza la puede corregir');
  const otraVez = api.nuevaSolicitud(devuelta, 'debito', moza, t0);
  assert.notEqual(otraVez.solicitud_cobro.id, pedida.solicitud_cobro.id);
  assert.deepEqual(devuelta.historial.map(e => e.tipo), ['cobro_solicitado', 'ticket_emitido', 'ticket_anulado', 'cobro_rechazado']);
});

test('el cobro que sale de una solicitud tiene id fijo: no se duplica', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  const id = api.pagoIdDeSolicitud(pedida.solicitud_cobro);
  assert.equal(id, api.pagoIdDeSolicitud(pedida.solicitud_cobro));
  assert.match(id, /^pago-[0-9a-f-]{36}$/);
  const pagada = api.marcarPagada({ ...pedida, estado: 'cobrado' }, id, cajero, t0);
  assert.equal(api.estadoCobro(pagada), 'pagada');
  assert.equal(pagada.solicitud_cobro.pago_id, id);
  assert.equal(pagada.solicitud_cobro.resuelta_por_nombre, 'Caja Uno');
  assert.equal(api.cobroEnCurso(pagada), false);
});

test('si la comanda cambia, la solicitud queda vieja', () => {
  const pedida = api.nuevaSolicitud(mesaM2(), 'efectivo', moza, t0);
  assert.equal(api.solicitudDesactualizada(pedida), false);
  assert.equal(api.solicitudDesactualizada({ ...pedida, total: 15000 }), true);
});

test('enviar a cocina manda solo lo nuevo; lo entregado no se reenvía', () => {
  const pedido = mesaM2({ items: [...mesaM2().items, item('d', 'pendiente', 2, 1500, { sin_enviar: true })] });
  assert.equal(api.estadoDePedido(pedido), 'esperando_pedido');
  assert.deepEqual(api.itemsParaCocina(pedido).map(i => i.id), ['a', 'b', 'c'], 'cocina no ve lo no enviado');
  const enviado = api.enviarACocina(pedido, moza, t0);
  assert.equal(enviado.estado, 'en_preparacion');
  assert.equal(api.itemsSinEnviar(enviado).length, 0);
  assert.equal('sin_enviar' in enviado.items[3], false);
  assert.deepEqual(enviado.items.slice(0, 3), pedido.items.slice(0, 3), 'lo entregado queda igual');
  assert.equal(enviado.historial.at(-1).detalle, '2x Desayuno d');
  assert.equal(api.estadoDePedido(enviado), 'en_preparacion');
});

test('comandas viejas sin marca: nunca enviada = todo sin enviar; enviada = cocina ya lo tiene', () => {
  const nunca = mesaM2({ estado: 'abierto', items: [item('a', 'pendiente', 1, 100)] });
  assert.equal(api.itemsSinEnviar(nunca).length, 1);
  const enCocina = mesaM2({ estado: 'en_preparacion', items: [item('a', 'pendiente', 1, 100)] });
  assert.equal(api.itemsSinEnviar(enCocina).length, 0);
  assert.equal(api.estadoDePedido(enCocina), 'en_preparacion');
});

test('corregir lo que cocina no empezó recalcula y queda anotado', () => {
  const pedido = mesaM2({ estado: 'en_preparacion', items: [...mesaM2().items, item('d', 'pendiente', 2, 1500)], subtotal: 17190, total: 17190 });
  const menos = api.corregirItemPendiente(pedido, 'd', { cantidad: 1 }, moza, t0);
  assert.equal(menos.total, 15690);
  assert.equal(menos.historial.at(-1).tipo, 'item_modificado');
  const sacado = api.corregirItemPendiente(pedido, 'd', { cantidad: 0 }, moza, t0);
  assert.equal(sacado.items.length, 3);
  assert.equal(sacado.total, 14190);
  assert.equal(sacado.historial.at(-1).tipo, 'item_eliminado');
  assert.throws(() => api.corregirItemPendiente(pedido, 'a', { cantidad: 0 }, moza), /solo se puede anular/);
});

test('lo entregado solo se anula con permiso y motivo, y deja de cobrarse', () => {
  const pedido = mesaM2();
  assert.throws(() => api.anularItem(pedido, 'a', 'se cayó', moza), /encargado/);
  assert.throws(() => api.anularItem(pedido, 'a', ' ', encargado), /motivo/);
  const anulado = api.anularItem(pedido, 'a', 'se cayó', encargado, t0);
  assert.equal(anulado.items.length, 3, 'queda en la comanda');
  assert.equal(anulado.items[0].estado, 'cancelado');
  assert.equal(anulado.items[0].motivo_anulacion, 'se cayó');
  assert.equal(anulado.items[0].anulado_por, 'Encargado');
  assert.equal(anulado.total, 9460);
  assert.equal(anulado.historial.at(-1).tipo, 'item_anulado');
  const pedida = api.nuevaSolicitud(pedido, 'efectivo', moza, t0);
  assert.throws(() => api.anularItem(pedida, 'a', 'x', encargado), /Cancelalo/);
});

test('cambiar de mesa: la comanda entera pasa a una mesa libre y queda anotado', () => {
  const mesa8 = { id: 'mesa-8', numero: 8, nombre: '', estado: 'libre' };
  const pedida = api.nuevaSolicitud(mesaM2({ mesa: { id: 'mesa-2', numero: 2, nombre: '' } }), 'efectivo', moza, t0);
  const movida = api.cambiarDeMesa(pedida, mesa8, [pedida], moza, t0);
  assert.equal(movida.mesa_id, 'mesa-8');
  assert.equal(movida.mesa.numero, 8);
  assert.equal(movida.items.length, 3, 'los productos van con la comanda');
  assert.equal(movida.solicitud_cobro.estado, 'solicitado', 'el pedido de cobro también');
  assert.equal(movida.total, 14190);
  assert.equal(movida.historial.at(-1).tipo, 'mesa_cambiada');
  assert.equal(movida.historial.at(-1).detalle, 'Mesa 2 → Mesa 8');
});

test('cambiar de mesa: no a una ocupada, cerrada ni a la misma; no si la comanda está cerrada', () => {
  const comanda = mesaM2({ mesa: { id: 'mesa-2', numero: 2, nombre: '' } });
  const otra = mesaM2({ id: 'ped-2', mesa_id: 'mesa-8' });
  assert.throws(() => api.cambiarDeMesa(comanda, { id: 'mesa-8', numero: 8, estado: 'ocupada' }, [comanda, otra], moza), /Mesa 8 ya tiene una comanda abierta/);
  assert.throws(() => api.cambiarDeMesa(comanda, { id: 'mesa-9', numero: 9, estado: 'cerrada' }, [comanda], moza), /fuera de servicio/);
  assert.throws(() => api.cambiarDeMesa(comanda, { id: 'mesa-2', numero: 2, estado: 'ocupada' }, [comanda], moza), /ya está en esa mesa/);
  assert.throws(() => api.cambiarDeMesa(mesaM2({ estado: 'cobrado' }), { id: 'mesa-9', numero: 9, estado: 'libre' }, [], moza), /cerrada/);
  const cobradaEnLaOtra = mesaM2({ id: 'ped-3', mesa_id: 'mesa-8', estado: 'cobrado' });
  assert.equal(api.cambiarDeMesa(comanda, { id: 'mesa-8', numero: 8, estado: 'libre' }, [comanda, cobradaEnLaOtra], moza).mesa_id, 'mesa-8', 'una comanda ya cobrada no ocupa la mesa');
});
