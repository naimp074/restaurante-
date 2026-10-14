import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Pedidos para llevar, delivery propio y cierre de pedidos de PedidosYa (sin Supabase).
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/pedidosExternos';
  export * from './src/lib/pedidosCanal';
  export * from './src/lib/demoStore';
  export * from './src/lib/finance';
  export * from './src/lib/storeSync';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' } });
const mod = new Module(path.resolve('tests/pedidosCanal.compiled.cjs'));
mod.filename = path.resolve('tests/pedidosCanal.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const api = mod.exports;

let storage;
const leer = clave => JSON.parse(storage.get(`restaurant-${clave}`) || 'null');
const poner = (clave, valor) => storage.set(`restaurant-${clave}`, JSON.stringify(valor));
const ahora = new Date().toISOString();
const burger = { id: 'prod-burger', nombre: 'Hamburguesa', precio_venta: 5000, disponible: true, agotado: false,
  receta: [{ id: 'r1', producto_id: 'prod-burger', tipo: 'stock', ingrediente_id: 'ing-pan', cantidad: 1 }] };

beforeEach(() => {
  storage = new Map();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  } });
  api.resetStoreWriteMarks();
  poner('productos', [burger]);
  poner('demo-ingredientes', [{ id: 'ing-pan', nombre: 'Pan', stock_actual: 10, costo_por_unidad: 100, unidad_medida: 'unidad' }]);
});

const pedidoPedidosYa = (extra = {}) => ({
  id: 'ped-pya-t1', mesa_id: '', canal: 'pedidosya', cantidad_personas: 1, estado: 'en_preparacion',
  subtotal: 10000, descuento: 0, recargo: 0, total: 10000, observaciones: '', cobro: 'plataforma',
  cliente_nombre: 'Ana', hora_apertura: ahora, created_at: ahora, updated_at: ahora,
  items: [{ id: 'i1', pedido_id: 'ped-pya-t1', producto_id: 'prod-burger', cantidad: 2, precio_unitario: 5000, subtotal: 10000,
    observaciones: '', estado: 'listo', created_at: ahora, updated_at: ahora, producto: burger }],
  externo: { plataforma: 'pedidosya', token: 't1', codigo: 'ab12', codigo_corto: '42', tipo_entrega: 'delivery_plataforma',
    pagado_online: true, estado_plataforma: 'aceptado', vence_at: '', entrega_estimada: '', total_plataforma: 10000,
    prueba: false, sin_reconocer: [], acciones: { aceptar: true, rechazar: true, listo: true, retirado: true } },
  ...extra,
});

test('un pedido para llevar va directo a cocina y se cobra en caja', () => {
  const pedido = api.crearPedidoLocal({ canal: 'mostrador', cliente_nombre: 'Juan', cliente_telefono: '', direccion_entrega: '',
    costo_envio: 999, observaciones: '', lineas: [{ producto: burger, cantidad: 2, observaciones: 'sin sal' }] });
  assert.equal(pedido.estado, 'en_preparacion');
  assert.equal(pedido.mesa_id, '');
  assert.equal(pedido.total, 10000, 'para llevar no suma envío');
  assert.equal(pedido.cobro, 'caja');
  assert.equal(api.etiquetaPedido(pedido), 'Para llevar · Juan');
  assert.equal(leer('demo-pedidos').length, 1);
});

test('el delivery propio suma el envío y exige dirección', () => {
  assert.throws(() => api.crearPedidoLocal({ canal: 'delivery', cliente_nombre: 'Ana', cliente_telefono: '', direccion_entrega: ' ',
    costo_envio: 800, observaciones: '', lineas: [{ producto: burger, cantidad: 1, observaciones: '' }] }), /dirección/);
  const pedido = api.crearPedidoLocal({ canal: 'delivery', cliente_nombre: 'Ana', cliente_telefono: '11 5555', direccion_entrega: 'Mitre 100',
    costo_envio: 800, observaciones: '', lineas: [{ producto: burger, cantidad: 1, observaciones: '' }] });
  assert.equal(pedido.subtotal, 5800);
  assert.equal(pedido.total, 5800);
  assert.equal(pedido.costo_envio, 800);
});

test('sin productos no se crea el pedido', () => {
  assert.throws(() => api.crearPedidoLocal({ canal: 'mostrador', cliente_nombre: '', cliente_telefono: '', direccion_entrega: '',
    costo_envio: 0, observaciones: '', lineas: [] }), /producto/);
});

test('finalizar un pedido pagado en PedidosYa: stock, saldo a cobrar neto de comisión y nada en caja', () => {
  poner('demo-pedidos', [pedidoPedidosYa()]);
  poner('cajas-diarias', [{ id: 'caja', fecha: 'x', estado: 'abierta', efectivo: 0, total_ventas: 0, monto_esperado_efectivo: 0 }]);
  api.finalizarPedidoPlataforma('ped-pya-t1', 25);

  const pedido = leer('demo-pedidos')[0];
  assert.equal(pedido.estado, 'cobrado');
  assert.ok(pedido.hora_cierre);
  assert.equal(leer('demo-ingredientes')[0].stock_actual, 8);

  const cuenta = leer('cuentas-dinero').find(c => c.id === api.cuentaPedidosYaId);
  assert.equal(cuenta.saldo, 7500);
  const movimiento = leer('movimientos-financieros')[0];
  assert.equal(movimiento.monto, 7500);
  assert.match(movimiento.descripcion, /comisión 25%/);
  assert.equal(leer('cajas-diarias')[0].total_ventas, 0, 'la caja del día no cambia');
  assert.equal(leer('pagos'), null, 'no se registra un cobro de caja');
});

test('no se puede finalizar dos veces, ni si no se aceptó, ni si se cobra en caja', () => {
  poner('demo-pedidos', [pedidoPedidosYa()]);
  api.finalizarPedidoPlataforma('ped-pya-t1', 0);
  assert.throws(() => api.finalizarPedidoPlataforma('ped-pya-t1', 0), /cerrado/);
  assert.equal(leer('demo-ingredientes')[0].stock_actual, 8, 'el stock se descontó una sola vez');

  poner('demo-pedidos', [pedidoPedidosYa({ externo: { ...pedidoPedidosYa().externo, estado_plataforma: 'pendiente' } })]);
  assert.throws(() => api.finalizarPedidoPlataforma('ped-pya-t1', 0), /aceptá/);
  poner('demo-pedidos', [pedidoPedidosYa({ cobro: 'caja' })]);
  assert.throws(() => api.finalizarPedidoPlataforma('ped-pya-t1', 0), /Caja/);
});

test('aceptar en PedidosYa manda el pedido a cocina; rechazar lo cancela', () => {
  poner('demo-pedidos', [pedidoPedidosYa({ estado: 'abierto', externo: { ...pedidoPedidosYa().externo, estado_plataforma: 'pendiente' } })]);
  api.aplicarEstadoPlataforma('ped-pya-t1', 'aceptado');
  assert.equal(leer('demo-pedidos')[0].estado, 'en_preparacion');
  api.aplicarEstadoPlataforma('ped-pya-t1', 'rechazado');
  assert.equal(leer('demo-pedidos')[0].estado, 'cancelado');
});

test('las etiquetas y el cobro dependen del canal', () => {
  const salon = { canal: undefined, mesa: { numero: 4 }, cobro: undefined };
  assert.equal(api.etiquetaPedido(salon), 'Mesa 4');
  assert.equal(api.esDeSalon(salon), true);
  assert.equal(api.etiquetaPedido(pedidoPedidosYa()), 'PedidosYa #42 · Ana');
  assert.equal(api.cobraEnCaja(pedidoPedidosYa()), false);
  assert.equal(api.cobraEnCaja(pedidoPedidosYa({ cobro: 'caja' })), true);
  assert.equal(api.netoPedidosYa(10000, 22.5), 7750);
});
