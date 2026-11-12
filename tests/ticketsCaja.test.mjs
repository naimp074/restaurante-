import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: `export * from './src/lib/ticketsCaja'; export { dayKey } from './src/lib/fechas'; export { rechazarSolicitud } from './src/lib/cobroComanda';`,
    resolveDir: process.cwd(),
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/ticketsCaja.compiled.cjs'));
mod.filename = path.resolve('tests/ticketsCaja.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { anularCobroRegistrado, aplicarEnComanda, marcarTicketSinArca, dayKey, rechazarSolicitud } = mod.exports;

const key = {
  pedidos: 'restaurant-demo-pedidos',
  pagos: 'restaurant-pagos',
  caja: 'restaurant-cajas-diarias',
  cuentas: 'restaurant-cuentas-dinero',
  fin: 'restaurant-movimientos-financieros',
  stock: 'restaurant-demo-ingredientes',
  productos: 'restaurant-productos',
  movimientos: 'restaurant-demo-movimientos-stock',
  mesas: 'restaurant-mesas',
};

let storage;
const put = (k, value) => storage.set(k, JSON.stringify(value));
const get = k => JSON.parse(storage.get(k) || '[]');
const t0 = '2026-11-11T18:00:00.000Z';
const actor = { id: 'u-caja', nombre: 'Ana Caja', rol: 'cajero' };

const pedidoAbierto = () => ({
  id: 'ped-1', mesa_id: 'mesa-2', estado: 'entregado', subtotal: 1000, descuento: 0, recargo: 0, total: 1000,
  observaciones: '', hora_apertura: t0, created_at: t0, updated_at: t0, cantidad_personas: 2,
  mesa: { id: 'mesa-2', numero: 2, nombre: 'Mesa 2' },
  items: [{
    id: 'it-1', pedido_id: 'ped-1', producto_id: 'prod-1', cantidad: 1, precio_unitario: 1000, subtotal: 1000,
    observaciones: '', estado: 'entregado', created_at: t0, updated_at: t0, producto: { nombre: 'Café' },
  }],
  solicitud_cobro: {
    id: 'sol-1', estado: 'ticket_emitido', metodo_pago: 'efectivo', subtotal: 1000, descuento: 0, recargo: 0, total: 1000,
    solicitada_at: t0, solicitada_por_nombre: 'Moza', ticket_at: t0, ticket_por_nombre: 'Ana Caja',
    ticket: { total: 1000, descuento: 0, recargo: 0, metodo_pago: 'efectivo' },
  },
});

const armarPago = fecha => ({
  id: 'pago-1', pedido_id: 'ped-1', tipo_comprobante: 'factura', metodo_pago: 'mixto',
  monto: 1000, monto_efectivo: 400, monto_transferencia: 0, monto_debito: 600, monto_credito: 0,
  descuento_aplicado: 0, recargo_aplicado: 0, total_cobrado: 1000, vuelto: 0, created_at: fecha,
  pedido: pedidoAbierto(),
});

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
  });
  put('restaurant-config-local', { hora_corte: 0, nombre: 'Local' });
});

const sembrarVenta = () => {
  const fecha = dayKey(t0);
  const pago = armarPago(t0);
  put(key.pedidos, [{ ...pedidoAbierto(), estado: 'cobrado', hora_cierre: t0 }]);
  put(key.pagos, [pago]);
  put(key.caja, [{
    id: 'caja-1', fecha, estado: 'abierta', monto_inicial: 100,
    efectivo: 400, tarjeta: 600, transferencia: 0, total_ventas: 1000, monto_esperado_efectivo: 500,
  }]);
  const hoy = dayKey();
  put(key.cuentas, [
    { id: 'cuenta-caja-dia', nombre: 'Caja del día', tipo: 'efectivo', saldo: 5000, saldo_fecha: hoy, activa: true },
    { id: 'cuenta-caja-grande', nombre: 'Caja grande', tipo: 'efectivo', saldo: 0, activa: true },
    { id: 'cuenta-banco', nombre: 'Banco', tipo: 'banco', saldo: 3000, activa: true },
  ]);
  put(key.fin, []);
  put(key.stock, [{ id: 'ing-1', stock_actual: 8 }]);
  put(key.productos, [{
    id: 'prod-1', nombre: 'Café',
    receta: [{ id: 'r1', producto_id: 'prod-1', tipo: 'ingrediente', ingrediente_id: 'ing-1', cantidad: 2, unidad_medida: 'u', costo_calculado: 0, created_at: t0 }],
  }]);
  put(key.movimientos, []);
  put(key.mesas, [{ id: 'mesa-2', numero: 2, nombre: 'Mesa 2', estado: 'libre' }]);
  return pago;
};

test('cancelar un cobro devuelve la comanda, el stock y la plata', () => {
  const pago = sembrarVenta();
  anularCobroRegistrado(pago, actor, 'Pagaron con transferencia');

  assert.equal(get(key.pagos).length, 0);
  const pedido = get(key.pedidos)[0];
  assert.equal(pedido.estado, 'entregado');
  assert.equal(pedido.hora_cierre, undefined);
  assert.equal(pedido.solicitud_cobro.estado, 'solicitado');
  assert.equal(pedido.solicitud_cobro.ticket, undefined);
  assert.ok(pedido.historial.some(evento => evento.tipo === 'pago_anulado' && evento.detalle === 'Pagaron con transferencia'));
  assert.ok(pedido.historial.some(evento => evento.tipo === 'ticket_anulado'));

  const caja = get(key.caja)[0];
  assert.equal(caja.efectivo, 0);
  assert.equal(caja.tarjeta, 0);
  assert.equal(caja.total_ventas, 0);
  assert.equal(caja.monto_esperado_efectivo, 100);

  const cuentas = Object.fromEntries(get(key.cuentas).map(cuenta => [cuenta.id, cuenta.saldo]));
  assert.equal(cuentas['cuenta-caja-dia'], 4600);
  assert.equal(cuentas['cuenta-banco'], 2400);
  assert.equal(get(key.stock)[0].stock_actual, 10);
  assert.equal(get(key.mesas)[0].estado, 'ocupada');
  assert.throws(() => anularCobroRegistrado(pago, actor, 'Otra vez'), /ya no está/);
  assert.equal(get(key.stock)[0].stock_actual, 10);
});

test('no cancela el cobro si la caja de ese día ya cerró', () => {
  const pago = sembrarVenta();
  put(key.caja, [{ ...get(key.caja)[0], estado: 'cerrada' }]);
  assert.throws(() => anularCobroRegistrado(pago, actor, 'Pagaron de otra forma'), /caja de ese día ya está cerrada/);
  assert.equal(get(key.pagos).length, 1);
  assert.equal(get(key.pedidos)[0].estado, 'cobrado');
  assert.equal(get(key.stock)[0].stock_actual, 8);
});

test('pide un motivo y no toca nada si falta', () => {
  const pago = sembrarVenta();
  assert.throws(() => anularCobroRegistrado(pago, actor, '   '), /por qué se cancela/);
  assert.equal(get(key.pagos).length, 1);
});

test('marcar sin ARCA deja el cobro como ticket', () => {
  sembrarVenta();
  marcarTicketSinArca('pago-1');
  assert.equal(get(key.pagos)[0].tipo_comprobante, 'ticket');
  assert.throws(() => marcarTicketSinArca('no-esta'), /ya no está/);
});

test('rechazar una comanda abierta la devuelve sin facturar', () => {
  const pedido = { ...pedidoAbierto(), solicitud_cobro: { ...pedidoAbierto().solicitud_cobro, estado: 'solicitado' } };
  delete pedido.solicitud_cobro.ticket;
  put(key.pedidos, [pedido]);
  put(key.mesas, [{ id: 'mesa-2', numero: 2, estado: 'ocupada' }]);

  const final = aplicarEnComanda(pedido.id, actual => rechazarSolicitud(actual, 'No va a ARCA', actor));
  assert.equal(final.solicitud_cobro.estado, 'rechazada');
  assert.equal(final.solicitud_cobro.motivo_rechazo, 'No va a ARCA');
  assert.equal(get(key.pedidos)[0].solicitud_cobro.estado, 'rechazada');
});
