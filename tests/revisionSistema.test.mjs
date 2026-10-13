import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// Servicios reales con almacenamiento aislado; no accede a los datos del negocio.
const compiled = await build({ stdin: { contents: `
  export * from './src/lib/finance';
  export * from './src/lib/storeSync';
  export * from './src/lib/cajaStore';
  export * from './src/lib/costosReceta';
  export * from './src/lib/listasPreciosStore';
  export * from './src/lib/mesasStore';
  export * from './src/lib/ventasStock';
  export * from './src/lib/fechas';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
const service = new Module(path.resolve('tests/revisionSistema.compiled.cjs'));
service.filename = path.resolve('tests/revisionSistema.compiled.cjs');
service.paths = Module._nodeModulePaths(process.cwd());
service._compile(compiled.outputFiles[0].text, service.filename);
const api = service.exports;
let storage, failKey, events, queued;
const put = (key, value) => storage.set(`restaurant-${key}`, JSON.stringify(value));
const get = key => JSON.parse(storage.get(`restaurant-${key}`) || '[]');
const snapshot = () => JSON.stringify([...storage].sort(([a], [b]) => a.localeCompare(b)));
const compra = overrides => ({ compra_id: 'c1', proveedor_id: 'prov1', fecha: api.dayKey(), concepto: 'Compra harina',
  observaciones: '', total: 3000, monto_pagado: 3000, cuenta_origen_id: api.cuentaCajaDiaId, metodo_pago: 'efectivo', ...overrides });
beforeEach(() => {
  storage = new Map(); failKey = null; events = []; queued = [];
  api.resetStoreWriteMarks();
  globalThis.window = Object.assign(new EventTarget(), { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => {
      if (key === failKey) { failKey = null; throw new Error('Almacenamiento lleno'); }
      storage.set(key, String(value));
    },
    removeItem: key => storage.delete(key),
  } });
  api.onStoreWrite(key => queued.push(key));
  window.addEventListener('restaurant-cuentas-dinero-updated', () => events.push('cuentas'));
  window.addEventListener('restaurant-gastos-updated', () => events.push('gastos'));
  put('cuentas-dinero', [
    { id: api.cuentaCajaDiaId, nombre: 'Caja del día', tipo: 'efectivo', saldo: 10000, saldo_fecha: api.dayKey(), activa: true },
    { id: api.cuentaCajaGrandeId, nombre: 'Caja grande', tipo: 'efectivo', saldo: 20000, activa: true },
  ]);
  put('cajas-diarias', [{ id: 'caja', fecha: api.dayKey(), estado: 'abierta', monto_inicial: 10000, monto_esperado_efectivo: 10000 }]);
});

test('un documento remoto más viejo no pisa una escritura local reciente', () => {
  api.writeStore('restaurant-productos', [{ id: 'combo-excel' }], 'restaurant-productos-updated');
  assert.equal(api.debeAplicarRemoto('restaurant-productos', new Date(Date.now() - 60_000).toISOString()), false);
  assert.equal(api.debeAplicarRemoto('restaurant-productos', new Date(Date.now() + 60_000).toISOString()), true);
});

test('el margen es el recargo sobre el costo: 100 de costo y 200 de venta son 100%', () => {
  assert.equal(api.margenPorcentaje(200, 100), 100);
  assert.equal(api.precioPorMargen(100, 100), 200);
});

test('compra: fallo al guardar el gasto revierte factura, dinero, pago y caja, sin avisos ni sincronización parcial', () => {
  const before = snapshot(); failKey = 'restaurant-gastos';
  assert.throws(() => api.registrarGastoCompra(compra()), /Almacenamiento lleno/);
  assert.equal(snapshot(), before);
  assert.deepEqual(events, []); assert.deepEqual(queued, []);
  api.registrarGastoCompra(compra());
  assert.equal(get('gastos').length, 1);
  assert.equal(get('pagos-proveedor').length, 1);
  assert.equal(get('cuentas-dinero')[0].saldo, 7000);
});

test('compra y stock forman una sola operación: el fallo en stock también revierte el pago', () => {
  const before = snapshot(); failKey = 'restaurant-demo-ingredientes';
  assert.throws(() => api.withStoreTransaction(() => {
    api.registrarGastoCompra(compra());
    api.writeStore('restaurant-demo-ingredientes', [{ id: 'harina', stock_actual: 10 }], 'restaurant-ingredientes-updated');
  }), /Almacenamiento lleno/);
  assert.equal(snapshot(), before); assert.deepEqual(queued, []);
});

test('un fallo al encolar sincronización también revierte la operación antes de notificar', () => {
  const before = snapshot();
  api.onStoreWrite(() => api.applyStoreLocally('restaurant-sync-cola', ['restaurant-gastos'], 'sync'));
  failKey = 'restaurant-sync-cola';
  assert.throws(() => api.registrarGastoCompra(compra()), /Almacenamiento lleno/);
  assert.equal(snapshot(), before); assert.deepEqual(events, []);
});

test('un gasto puede consumir parte del fondo inicial; el arqueo refleja el efectivo real', () => {
  api.registrarGastoCompra(compra());
  assert.equal(get('cajas-diarias')[0].monto_esperado_efectivo, 7000);
  assert.equal(get('cuentas-dinero')[0].saldo, 7000);
});

test('pago de proveedor: fallo en movimiento revierte todo y permite reintentar', () => {
  api.registrarGastoCompra(compra({ monto_pagado: 0 }));
  const before = snapshot();
  const factura = get('facturas-proveedor')[0]; failKey = 'restaurant-movimientos-financieros';
  assert.throws(() => api.registrarPagoProveedor({ proveedor_id: 'prov1', factura_id: factura.id,
    cuenta_origen_id: api.cuentaCajaDiaId, metodo_pago: 'efectivo', monto: 1000 }), /Almacenamiento lleno/);
  assert.equal(snapshot(), before);
});

test('rechaza sobrepagos, factura ajena, cuenta inexistente y montos inválidos sin tocar saldos', () => {
  api.registrarGastoCompra(compra({ monto_pagado: 0 }));
  const factura = get('facturas-proveedor')[0];
  const base = { proveedor_id: 'prov1', factura_id: factura.id, cuenta_origen_id: api.cuentaCajaDiaId, metodo_pago: 'efectivo', monto: 1000 };
  for (const changes of [{ monto: 4000 }, { monto: -1 }, { monto: 0 }, { monto: NaN }, { proveedor_id: 'otro' }, { cuenta_origen_id: 'no-existe' }]) {
    const before = snapshot();
    assert.throws(() => api.registrarPagoProveedor({ ...base, ...changes }));
    assert.equal(snapshot(), before);
  }
});

test('cierre automático de ayer: refrescar cuentas desde los avisos no duplica el arrastre', () => {
  const cuentas = get('cuentas-dinero'); cuentas[0].saldo_fecha = '2020-01-01'; put('cuentas-dinero', cuentas);
  let refreshes = 0;
  window.addEventListener('restaurant-movimientos-financieros-updated', () => {
    refreshes += 1;
    if (refreshes < 5) api.loadCuentasDinero();
  });
  api.loadCuentasDinero();
  assert.equal(refreshes, 1);
  assert.equal(get('movimientos-financieros').length, 1);
  assert.equal(get('cuentas-dinero')[0].saldo, 0);
  assert.equal(get('cuentas-dinero')[1].saldo, 30000);
});

test('traspaso conserva el dinero y rechaza misma cuenta, cuenta inexistente o monto negativo', () => {
  const base = { cuenta_origen_id: api.cuentaCajaDiaId, cuenta_destino_id: api.cuentaCajaGrandeId, monto: 2000, descripcion: 'Traspaso' };
  api.transferirEntreCuentas(base);
  assert.deepEqual(get('cuentas-dinero').map(c => c.saldo), [8000, 22000]);
  for (const changes of [{ cuenta_destino_id: api.cuentaCajaDiaId }, { cuenta_destino_id: 'no-existe' }, { monto: -1 }]) {
    const before = snapshot(); assert.throws(() => api.transferirEntreCuentas({ ...base, ...changes })); assert.equal(snapshot(), before);
  }
});

test('un insumo se puede convertir en combo vendible de una unidad', () => {
  const tortilla = { id: 'tortilla', nombre: 'Tortilla', unidad_medida: 'unidad', costo_por_unidad: 500 };
  const combo = api.crearComboDesdeInsumo(tortilla, { precioVenta: 1500, cantidad: 1 });
  assert.equal(combo.nombre, 'Tortilla');
  assert.equal(combo.precio_venta, 1500);
  assert.equal(combo.costo_produccion, 500);
  assert.equal(combo.receta[0].ingrediente_id, 'tortilla');
  assert.equal(combo.receta[0].cantidad, 1);
  assert.equal(api.comboDelInsumo([combo], 'tortilla').id, combo.id);
  assert.equal(api.comboDelInsumo([combo], 'leche'), undefined);
});

test('bajas y aumentos recalculan costos y margen de recetas y preparaciones sin cambiar precios de venta', () => {
  const ingredientes = [{ id: 'harina', costo_por_unidad: 500 }];
  const producciones = [{ id: 'masa', cantidad_producida: 10, receta: [{ ingrediente_id: 'harina', cantidad: 2 }] }];
  const productos = [
    { id: 'pan', precio_venta: 2000, costo_produccion: 1000, receta: [{ ingrediente_id: 'harina', cantidad: 1 }] },
    { id: 'pizza', precio_venta: 3000, costo_produccion: 50, receta: [{ tipo: 'produccion', produccion_id: 'masa', cantidad: 1 }] },
  ];
  const updated = api.actualizarCostosProductos(productos, ingredientes, producciones);
  assert.equal(updated[0].costo_produccion, 500); assert.equal(updated[0].margen_ganancia, 300);
  assert.equal(updated[1].costo_produccion, 100);
  assert.deepEqual(updated.map(p => p.precio_venta), [2000, 3000]);
});

test('una compra de urgencia avisa el cambio de costo y no toca combos si se deja el costo', () => {
  const ingredientes = [{ id: 'leche', nombre: 'Leche', unidad_medida: 'litros', costo_por_unidad: 1000 }];
  const productos = [{
    id: 'cafe-leche', nombre: 'Café con leche', precio_venta: 2000, costo_produccion: 200,
    receta: [{ ingrediente_id: 'leche', cantidad: 0.2, costo_calculado: 200 }],
  }];
  const cambios = api.detectarCambiosCosto(ingredientes, new Map([['leche', 10000]]));
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0].nombre, 'Leche');
  assert.equal(cambios[0].costoAnterior, 1000);
  assert.equal(cambios[0].costoNuevo, 10000);

  const sinCambio = api.actualizarCostosProductos(productos, ingredientes, []);
  assert.equal(sinCambio[0].costo_produccion, 200);
  assert.equal(sinCambio[0].precio_venta, 2000);
});

test('el costo de combos y el precio sugerido salen del stock, no de un valor guardado en la receta', () => {
  const ingredientes = [{ id: 'tortilla', nombre: 'TORTILLA', unidad_medida: 'unidad', costo_por_unidad: 200 }];
  const producto = {
    id: 'combo-tortilla',
    precio_venta: 400,
    costo_produccion: 100,
    receta: [{
      ingrediente_id: 'tortilla',
      cantidad: 1,
      costo_calculado: 100,
      ingrediente: { id: 'tortilla', nombre: 'TORTILLA', costo_por_unidad: 100, unidad_medida: 'unidad' },
    }],
  };
  const vivo = api.calcularCostoProducto(producto, id => ingredientes.find(i => i.id === id)?.costo_por_unidad || 0, []);
  assert.equal(vivo, 200);
  const actualizados = api.actualizarCostosProductos([producto], ingredientes, []);
  assert.equal(actualizados[0].costo_produccion, 200);
  assert.equal(actualizados[0].precio_venta, 400);
  const impacto = api.analizarImpactoCompra({
    ingredientes: [{ ...ingredientes[0], costo_por_unidad: 100 }],
    costosNuevos: new Map([['tortilla', 200]]),
    productos: [producto],
    producciones: [],
  });
  assert.equal(impacto.productos[0].costoNuevo, 200);
});

test('si se acepta el nuevo costo, se actualizan costo y precio de los combos que lo usan', () => {
  const ingredientes = [{ id: 'leche', nombre: 'Leche', unidad_medida: 'litros', costo_por_unidad: 1000 }];
  const productos = [{
    id: 'cafe-leche', nombre: 'Café con leche', precio_venta: 2000, costo_produccion: 200,
    receta: [{ ingrediente_id: 'leche', cantidad: 0.2, costo_calculado: 200 }],
  }];
  const impacto = api.analizarImpactoCompra({
    ingredientes, costosNuevos: new Map([['leche', 2000]]), productos, producciones: [],
  });
  const conCosto = api.actualizarCostosProductos(productos, [{ ...ingredientes[0], costo_por_unidad: 2000 }], []);
  const conPrecio = api.aplicarPreciosSugeridos(conCosto, impacto);
  assert.equal(conCosto[0].costo_produccion, 400);
  assert.equal(conPrecio[0].precio_venta, 4000);
});

test('listas aplican porcentaje general y excepción por producto, excluyendo cancelados', () => {
  const lista = { descuento_general: 10, descuentos_productos: { cafe: 20 } };
  assert.equal(api.calcularAjusteLista({ items: [
    { producto_id: 'cafe', subtotal: 1000, estado: 'entregado' },
    { producto_id: 'pan', subtotal: 500, estado: 'pendiente' },
    { producto_id: 'cafe', subtotal: 9000, estado: 'cancelado' },
  ] }, lista), 250);
});

test('mesas: comandas abiertas ocupan la mesa y cobradas, canceladas o a cuenta la liberan', () => {
  const mesa = { id: 'm1', estado: 'libre' };
  for (const estado of ['abierto', 'en_preparacion', 'listo', 'entregado']) {
    assert.equal(api.estadoOperativoMesa(mesa, [{ mesa_id: 'm1', estado }]), 'ocupada');
  }
  for (const estado of ['cobrado', 'cuenta_corriente', 'cancelado']) {
    assert.equal(api.estadoOperativoMesa(mesa, [{ mesa_id: 'm1', estado }]), 'libre');
  }
  assert.equal(api.estadoOperativoMesa({ ...mesa, estado: 'cerrada' }, []), 'cerrada');
});

test('venta consume cantidades de recetas y preparaciones, omite cancelados y permite reponer', () => {
  put('productos', [{ id: 'combo', receta: [
    { ingrediente_id: 'harina', cantidad: 2 }, { tipo: 'produccion', produccion_id: 'masa', cantidad: 1 },
  ] }]);
  put('demo-ingredientes', [{ id: 'harina', stock_actual: 20 }]);
  put('demo-producciones', [{ id: 'masa', stock_actual: 10 }]);
  const pedido = { id: 'ped1', items: [{ producto_id: 'combo', cantidad: 3, estado: 'entregado' }, { producto_id: 'combo', cantidad: 20, estado: 'cancelado' }] };
  api.descontarStockPorVenta(pedido);
  assert.equal(get('demo-ingredientes')[0].stock_actual, 14); assert.equal(get('demo-producciones')[0].stock_actual, 7);
  api.reponerStockPorVenta(pedido);
  assert.equal(get('demo-ingredientes')[0].stock_actual, 20); assert.equal(get('demo-producciones')[0].stock_actual, 10);
});
