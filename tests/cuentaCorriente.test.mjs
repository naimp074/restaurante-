import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Ejecuta el servicio real, con almacenamiento aislado; nunca toca datos del navegador.
const compiled = await build({ entryPoints: ['src/lib/cuentaCorrienteStore.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const service = new Module(path.resolve('tests/cuentaCorriente.compiled.cjs'));
service.filename = path.resolve('tests/cuentaCorriente.compiled.cjs');
service.paths = Module._nodeModulePaths(process.cwd());
service._compile(compiled.outputFiles[0].text, service.filename);
const { guardarClienteCuenta, pasarPedidoACuenta, registrarPagoCuenta, ajustarCuenta, revertirConsumoCuenta, saldoCliente, loadCuentaCorriente } = service.exports;
let storage;
let failKey;
let pedido;
const key = {
  pedidos: 'restaurant-demo-pedidos', stock: 'restaurant-demo-ingredientes', producciones: 'restaurant-demo-producciones',
  clientes: 'restaurant-cuenta-corriente', caja: 'restaurant-cajas-diarias', cuentas: 'restaurant-cuentas-dinero',
  fin: 'restaurant-movimientos-financieros', movimientos: 'restaurant-demo-movimientos-stock', mesas: 'restaurant-mesas',
};
const put = (k, value) => storage.set(k, JSON.stringify(value));
const get = k => JSON.parse(storage.get(k) || '[]');
const cliente = { id: 'cliente-1', nombre: 'Ana', telefono: '', nota: '', tipo_documento: 'DNI', numero_documento: '', condicion_iva: 'Consumidor final', domicilio: '' };
const args = (overrides = {}) => ({ pedido, cliente_id: cliente.id, descuento: 0, recargo: 0, anticipo: 0, metodo: 'efectivo', responsable: 'Cajera', ...overrides });
const pago = (monto, overrides = {}) => registrarPagoCuenta({ id: 'pago-1', cliente_id: cliente.id, monto, metodo: 'efectivo', responsable: 'Cajera', nota: '', ...overrides });
const snapshot = () => JSON.stringify([...storage].sort(([a], [b]) => a.localeCompare(b)));

beforeEach(async () => {
  storage = new Map(); failKey = null;
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => { if (k === failKey) { failKey = null; throw Error('Disco lleno'); } storage.set(k, String(v)); },
    removeItem: k => storage.delete(k),
  } });
  let pending = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: (_name, action) => { const next = pending.then(action); pending = next.catch(() => {}); return next; },
  } } });
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const producto = { id: 'cafe', nombre: 'Café con leche', precio_venta: 2500, receta: [
    { ingrediente_id: 'granos', cantidad: 20 }, { tipo: 'produccion', produccion_id: 'leche', cantidad: 1 },
  ] };
  pedido = { id: 'pedido-1', mesa_id: 'mesa-1', mesa: { id: 'mesa-1', numero: 1 }, estado: 'entregado', subtotal: 2500, total: 2500,
    descuento: 0, recargo: 0, updated_at: now.toISOString(), created_at: now.toISOString(), items: [
      { id: 'item-1', producto_id: 'cafe', producto, cantidad: 1, precio_unitario: 2500, subtotal: 2500, estado: 'entregado' },
      { id: 'cancelado', producto_id: 'cafe', producto, cantidad: 100, precio_unitario: 2500, subtotal: 250000, estado: 'cancelado' },
    ] };
  put(key.pedidos, [pedido]); put(key.stock, [{ id: 'granos', stock_actual: 1000 }]);
  put(key.producciones, [{ id: 'leche', stock_actual: 10 }]); put('restaurant-productos', [producto]);
  put(key.mesas, [{ id: 'mesa-1', estado: 'ocupada' }]);
  put(key.caja, [{ id: 'caja-1', fecha, estado: 'abierta', total_ventas: 0, efectivo: 0, tarjeta: 0, transferencia: 0, monto_esperado_efectivo: 100 }]);
  await guardarClienteCuenta(cliente);
});

test('consumo fiado: descuenta receta una vez, registra deuda, cierra pedido y libera mesa sin ingreso', async () => {
  const result = await pasarPedidoACuenta(args());
  assert.equal(result.saldo, 2500);
  assert.equal(get(key.stock)[0].stock_actual, 980);
  assert.equal(get(key.producciones)[0].stock_actual, 9);
  assert.equal(get(key.movimientos).length, 1);
  assert.equal(get(key.pedidos)[0].estado, 'cuenta_corriente');
  assert.equal(get(key.mesas)[0].estado, 'libre');
  assert.equal(get(key.caja)[0].total_ventas, 2500);
  assert.equal(get(key.caja)[0].efectivo, 0);
  assert.equal(get(key.fin).length, 0);
});

test('pago inicial y pagos posteriores: caja suma dinero, ventas y stock quedan iguales', async () => {
  await pasarPedidoACuenta(args({ anticipo: 500 }));
  assert.equal(saldoCliente(cliente.id), 2000);
  const stock = storage.get(key.stock);
  await pago(800);
  await pago(1200, { id: 'pago-2', metodo: 'transferencia' });
  assert.equal(saldoCliente(cliente.id), 0);
  assert.equal(storage.get(key.stock), stock);
  const caja = get(key.caja)[0];
  assert.equal(caja.total_ventas, 2500); assert.equal(caja.efectivo, 1300);
  assert.equal(caja.transferencia, 1200); assert.equal(caja.cobros_cuenta_corriente, 2500);
  assert.equal(caja.monto_esperado_efectivo, 1400);
  assert.ok(get(key.fin).every(m => m.origen === 'cobro_cuenta_corriente'));
  const cuentas = get(key.cuentas);
  assert.equal(cuentas.find(c => c.id === 'cuenta-caja-dia').saldo, 1300);
  assert.equal(cuentas.find(c => c.id === 'cuenta-banco').saldo, 1200);
});

test('dos consumos acumulan deuda y conservan precios y detalles históricos', async () => {
  await pasarPedidoACuenta(args());
  const segundo = { ...pedido, id: 'pedido-2', subtotal: 4000, total: 4000, items: [{ ...pedido.items[0], precio_unitario: 4000, subtotal: 4000 }] };
  put(key.pedidos, [...get(key.pedidos), segundo]);
  await pasarPedidoACuenta(args({ pedido: segundo }));
  await pago(3000);
  assert.equal(saldoCliente(cliente.id), 3500);
  put('restaurant-productos', [{ id: 'cafe', nombre: 'Nombre nuevo', precio_venta: 9000 }]);
  const original = loadCuentaCorriente().movimientos[0].pedido;
  assert.equal(original.total, 2500); assert.equal(original.items[0].producto.nombre, 'Café con leche');
});

test('doble envío concurrente de la misma comanda no duplica stock ni deuda', async () => {
  const results = await Promise.allSettled([pasarPedidoACuenta(args()), pasarPedidoACuenta(args())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(saldoCliente(cliente.id), 2500); assert.equal(get(key.stock)[0].stock_actual, 980);
});

test('un mismo pago reenviado se registra una sola vez', async () => {
  await pasarPedidoACuenta(args());
  await Promise.all([pago(1000), pago(1000)]);
  assert.equal(saldoCliente(cliente.id), 1500); assert.equal(get(key.caja)[0].efectivo, 1000);
});

test('rechaza pagos inválidos, excesivos y combinaciones que sobrepagan', async () => {
  await pasarPedidoACuenta(args());
  for (const monto of [-1, 0, NaN, Infinity, 2500.01]) {
    const before = snapshot(); await assert.rejects(pago(monto)); assert.equal(snapshot(), before);
  }
  const results = await Promise.allSettled([pago(2000, { id: 'a' }), pago(2000, { id: 'b' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(saldoCliente(cliente.id), 500);
});

test('cuenta cerrada, cliente inexistente y comanda modificada se rechazan sin mutaciones', async () => {
  for (const overrides of [{ cliente_id: 'inexistente' }, { pedido: { ...pedido, subtotal: 999 } }, { anticipo: 2500 }, { anticipo: -1 }, { descuento: NaN }]) {
    const before = snapshot(); await assert.rejects(pasarPedidoACuenta(args(overrides))); assert.equal(snapshot(), before);
  }
  put(key.caja, [{ ...get(key.caja)[0], estado: 'cerrada' }]);
  const before = snapshot(); await assert.rejects(pasarPedidoACuenta(args())); assert.equal(snapshot(), before);
});

test('no libera una mesa que todavía tiene otra comanda abierta', async () => {
  put(key.pedidos, [pedido, { ...pedido, id: 'otro' }]);
  await pasarPedidoACuenta(args()); assert.equal(get(key.mesas)[0].estado, 'ocupada');
});

test('ajuste exige motivo, no produce saldo negativo ni mueve dinero o stock', async () => {
  await pasarPedidoACuenta(args());
  const before = snapshot();
  await assert.rejects(ajustarCuenta({ id: 'ajuste', cliente_id: cliente.id, monto: -100, motivo: '', responsable: 'Admin' }));
  assert.equal(snapshot(), before);
  await ajustarCuenta({ id: 'ajuste', cliente_id: cliente.id, monto: -100, motivo: 'Cargo duplicado manual', responsable: 'Admin' });
  assert.equal(saldoCliente(cliente.id), 2400); assert.equal(get(key.stock)[0].stock_actual, 980); assert.equal(get(key.fin).length, 0);
  await assert.rejects(ajustarCuenta({ id: 'otro', cliente_id: cliente.id, monto: -2401, motivo: 'Corrección', responsable: 'Admin' }));
});

test('fallo de almacenamiento al final del consumo revierte stock, deuda, caja y mesa', async () => {
  const before = snapshot(); failKey = key.mesas;
  await assert.rejects(pasarPedidoACuenta(args({ anticipo: 500 })), /Disco lleno/);
  assert.equal(snapshot(), before);
  await pasarPedidoACuenta(args({ anticipo: 500 })); assert.equal(saldoCliente(cliente.id), 2000);
});

test('fallo de almacenamiento en un pago revierte también el ingreso de dinero', async () => {
  await pasarPedidoACuenta(args()); const before = snapshot(); failKey = key.clientes;
  await assert.rejects(pago(500), /Disco lleno/); assert.equal(snapshot(), before);
});

test('centavos, descuento y recargo no dejan residuos en el saldo', async () => {
  pedido = { ...pedido, subtotal: 100.10 }; put(key.pedidos, [pedido]);
  await pasarPedidoACuenta(args({ descuento: 0.10, recargo: 0.20, anticipo: 0.10 }));
  await pago(100.10); assert.equal(saldoCliente(cliente.id), 0); assert.equal(get(key.caja)[0].total_ventas, 100.20);
});

test('anular un fiado repone stock, reabre la comanda y la mesa, y deja la deuda en cero', async () => {
  await pasarPedidoACuenta(args({ anticipo: 500 }));
  await revertirConsumoCuenta({ pedidoId: pedido.id, responsable: 'Admin' });
  assert.equal(get(key.stock)[0].stock_actual, 1000);
  assert.equal(get(key.producciones)[0].stock_actual, 10);
  assert.equal(get(key.pedidos)[0].estado, 'abierto');
  assert.equal(get(key.mesas)[0].estado, 'ocupada');
  assert.equal(saldoCliente(cliente.id), 0);
  assert.equal(get(key.caja)[0].total_ventas, 0);
  assert.equal(get(key.caja)[0].efectivo, 0);
  await assert.rejects(revertirConsumoCuenta({ pedidoId: pedido.id, responsable: 'Admin' }));
});

test('clientes sin documento persisten y pueden editarse conservando su deuda', async () => {
  await pasarPedidoACuenta(args()); await guardarClienteCuenta({ ...cliente, nombre: 'Ana editada', telefono: '123' });
  assert.equal(loadCuentaCorriente().clientes.length, 1); assert.equal(saldoCliente(cliente.id), 2500);
  assert.equal(loadCuentaCorriente().clientes[0].nombre, 'Ana editada');
});
