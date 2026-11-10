import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

/*
  Pruebas en un navegador real (usa el Chrome instalado en la máquina).
  Arma el sistema en modo demo, sin Supabase: no toca datos del negocio.
  Correr con: npm run test:e2e
*/

const salida = path.resolve('.tmp/e2e-dist');
let servidor;
let navegador;
let BASE;

before(async () => {
  // Sin variables de Supabase el sistema arranca en modo demo.
  process.env.VITE_SUPABASE_URL = '';
  process.env.VITE_SUPABASE_ANON_KEY = '';
  await build({ logLevel: 'error', build: { outDir: salida, emptyOutDir: true } });
  servidor = await preview({ logLevel: 'error', build: { outDir: salida }, preview: { port: 0, host: '127.0.0.1' } });
  BASE = servidor.resolvedUrls.local[0].replace(/\/$/, '');
  navegador = await chromium.launch({ channel: 'chrome' });
});

after(async () => {
  await navegador?.close();
  await new Promise(resolve => servidor?.httpServer.close(resolve));
});

const sesion = async ({ conServiceWorker = false } = {}) => {
  const context = await navegador.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: conServiceWorker ? 'allow' : 'block' });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  return { context, page, errores };
};

const entrar = async (page, rol) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: rol, exact: true }).click();
  await page.waitForSelector('header h1');
};

const titulo = page => page.locator('header h1').innerText();

test('todas las pantallas abren sin errores para el administrador', async () => {
  const { context, page, errores } = await sesion();
  await entrar(page, 'Admin');
  const paginas = ['dashboard', 'ventas', 'mesas', 'cocina', 'caja', 'caja_arqueos', 'cobros', 'cuenta_corriente', 'productos',
    'combos', 'lista_precios', 'diferentes_listas', 'stock_insumos', 'stock_consumos', 'stock_produccion', 'proveedores',
    'gastos', 'gastos_pagos', 'gastos_traspasos', 'costos', 'reportes', 'usuarios', 'configuracion', 'pedidos_delivery'];
  for (const pagina of paginas) {
    await page.goto(`${BASE}/#/${pagina}`);
    await page.waitForSelector('header h1');
    await page.waitForTimeout(250);
    assert.ok((await page.locator('main').innerText()).trim().length > 5, `${pagina} quedó vacía`);
  }
  assert.deepEqual(errores, []);
  await context.close();
});

test('la dirección conserva la pantalla al recargar y el botón atrás funciona', async () => {
  const { context, page } = await sesion();
  await entrar(page, 'Admin');
  await page.goto(`${BASE}/#/stock_produccion`);
  await page.reload();
  await page.waitForSelector('header h1');
  assert.equal(await titulo(page), 'Producción');
  await page.goto(`${BASE}/#/proveedores`);
  await page.waitForSelector('header h1');
  await page.goBack();
  await page.waitForTimeout(250);
  assert.equal(await titulo(page), 'Producción');
  await context.close();
});

for (const [rol, prohibida, esperado] of [
  ['Moza', 'caja', 'Comandas'],
  ['Moza', 'usuarios', 'Comandas'],
  ['Cocina', 'reportes', 'Pantalla de Cocina'],
  ['Encargado', 'usuarios', 'Dashboard'],
]) {
  test(`${rol} no puede abrir #/${prohibida} escribiendo la dirección`, async () => {
    const { context, page } = await sesion();
    await entrar(page, rol);
    await page.goto(`${BASE}/#/${prohibida}`);
    await page.waitForTimeout(300);
    assert.equal(await titulo(page), esperado);
    await context.close();
  });
}

test('venta completa: abrir caja, comanda, cobro y descuento de stock', async () => {
  const { context, page, errores } = await sesion();
  const ahora = new Date().toISOString();
  await page.goto(BASE);
  await page.evaluate(ahora => {
    const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    set('restaurant-demo-ingredientes', [{ id: 'ing-pan', nombre: 'Pan', unidad_medida: 'unidad', stock_actual: 10, stock_minimo: 2,
      costo_por_unidad: 100, activo: true, created_at: ahora, updated_at: ahora }]);
    set('restaurant-productos', [{ id: 'prod-burger', nombre: 'Hamburguesa', descripcion: '', precio_venta: 5000, costo_produccion: 100,
      margen_ganancia: 0, disponible: true, agotado: false, tiempo_preparacion: 10, activo: true, created_at: ahora, updated_at: ahora,
      receta: [{ id: 'rec-1', producto_id: 'prod-burger', tipo: 'stock', ingrediente_id: 'ing-pan', cantidad: 1, unidad_medida: 'unidad',
        costo_calculado: 100, created_at: ahora }] }]);
    set('restaurant-mesas', [{ id: 'mesa-1', numero: 1, capacidad: 4, estado: 'libre', sector: 'salon', posicion_x: 0, posicion_y: 0,
      activa: true, created_at: ahora, updated_at: ahora }]);
  }, ahora);
  await entrar(page, 'Admin');

  await page.goto(`${BASE}/#/caja`);
  await page.getByPlaceholder('Ej: 20000').fill('10000');
  await page.getByRole('button', { name: /Abrir caja/ }).click();

  await page.goto(`${BASE}/#/ventas`);
  await page.getByRole('button', { name: /Mesa 1/ }).click();
  await page.getByRole('button', { name: /^Hamburguesa [$]/ }).click();
  await page.getByRole('button', { name: /^Hamburguesa [$]/ }).click();

  await page.goto(`${BASE}/#/cobros`);
  await page.getByRole('button', { name: /Mesa 1/ }).first().click();
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.waitForTimeout(400);

  const leer = clave => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), clave);
  const [pagos, pedidos, ingredientes, movimientos, mesas] = await Promise.all([
    leer('restaurant-pagos'), leer('restaurant-demo-pedidos'), leer('restaurant-demo-ingredientes'),
    leer('restaurant-demo-movimientos-stock'), leer('restaurant-mesas'),
  ]);
  assert.equal(pagos.length, 1);
  assert.match(pagos[0].id, /^pago-[0-9a-f-]{36}$/);
  assert.equal(pedidos[0].estado, 'cobrado');
  assert.equal(pedidos[0].total, 10000);
  assert.equal(ingredientes[0].stock_actual, 8);
  assert.equal(movimientos.length, 1);
  assert.equal('ingrediente' in movimientos[0], false);
  assert.equal(mesas[0].estado, 'libre');
  assert.deepEqual(errores, []);
  await context.close();
});

test('sin conexión abre una pantalla que todavía no se había visitado', async () => {
  const { context, page } = await sesion({ conServiceWorker: true });
  await entrar(page, 'Admin');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto(`${BASE}/#/proveedores`);
  await page.waitForSelector('header h1', { timeout: 8000 });
  assert.equal(await titulo(page), 'Proveedores');
  await context.close();
});

const sembrarCarta = async page => {
  const ahora = new Date().toISOString();
  await page.goto(BASE);
  await page.evaluate(ahora => {
    const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    set('restaurant-demo-ingredientes', [{ id: 'ing-pan', nombre: 'Pan', unidad_medida: 'unidad', stock_actual: 10, stock_minimo: 2,
      costo_por_unidad: 100, activo: true, created_at: ahora, updated_at: ahora }]);
    set('restaurant-productos', [{ id: 'prod-burger', codigo: 'BURGER', nombre: 'Hamburguesa', descripcion: '', precio_venta: 5000,
      costo_produccion: 100, margen_ganancia: 0, disponible: true, agotado: false, tiempo_preparacion: 10, activo: true,
      created_at: ahora, updated_at: ahora,
      receta: [{ id: 'rec-1', producto_id: 'prod-burger', tipo: 'stock', ingrediente_id: 'ing-pan', cantidad: 1, unidad_medida: 'unidad',
        costo_calculado: 100, created_at: ahora }] }]);
  }, ahora);
};

test('pedido para llevar: se carga, pasa por cocina y se cobra en caja', async () => {
  const { context, page, errores } = await sesion();
  await sembrarCarta(page);
  await entrar(page, 'Admin');
  await page.goto(`${BASE}/#/caja`);
  await page.getByPlaceholder('Ej: 20000').fill('5000');
  await page.getByRole('button', { name: /Abrir caja/ }).click();

  await page.goto(`${BASE}/#/pedidos_delivery`);
  await page.getByRole('button', { name: /Nuevo pedido/ }).click();
  await page.getByPlaceholder('Nombre del cliente').fill('Juan');
  await page.getByRole('button', { name: /^Hamburguesa [$]/ }).click();
  await page.getByRole('button', { name: /^Hamburguesa [$]/ }).click();
  await page.getByRole('button', { name: 'Crear y mandar a cocina' }).click();
  await page.getByText('Para llevar · Juan').waitFor();

  await page.goto(`${BASE}/#/cocina`);
  await page.getByText('Para llevar · Juan').waitFor();

  await page.goto(`${BASE}/#/cobros`);
  await page.getByRole('button', { name: /Para llevar · Juan/ }).click();
  await page.getByRole('button', { name: /^Cobrar / }).click();
  await page.waitForTimeout(400);
  const pedido = await page.evaluate(() => JSON.parse(localStorage.getItem('restaurant-demo-pedidos'))[0]);
  assert.equal(pedido.canal, 'mostrador');
  assert.equal(pedido.estado, 'cobrado');
  assert.equal(pedido.total, 10000);
  assert.deepEqual(errores, []);
  await context.close();
});

test('pedido de PedidosYa: aviso en el encabezado y cierre como saldo a cobrar, sin pasar por caja', async () => {
  const { context, page, errores } = await sesion();
  await sembrarCarta(page);
  const ahora = new Date().toISOString();
  const vence = new Date(Date.now() + 10 * 60_000).toISOString();
  await page.evaluate(({ ahora, vence }) => {
    localStorage.setItem('restaurant-demo-pedidos', JSON.stringify([{
      id: 'ped-pya-t1', mesa_id: '', canal: 'pedidosya', cantidad_personas: 1, estado: 'abierto', subtotal: 10000, descuento: 0,
      recargo: 0, total: 10000, observaciones: 'Sin cebolla', cobro: 'plataforma', cliente_nombre: 'Ana Gómez',
      cliente_telefono: '+54 11 5555', direccion_entrega: '', hora_apertura: ahora, created_at: ahora, updated_at: ahora,
      items: [{ id: 'i1', pedido_id: 'ped-pya-t1', producto_id: 'prod-burger', cantidad: 2, precio_unitario: 5000, subtotal: 10000,
        observaciones: 'Extra cheddar', estado: 'pendiente', created_at: ahora, updated_at: ahora, producto: { id: 'prod-burger', nombre: 'Hamburguesa' } }],
      externo: { plataforma: 'pedidosya', token: 't1', codigo: 'ab12', codigo_corto: '42', tipo_entrega: 'delivery_plataforma',
        pagado_online: true, estado_plataforma: 'pendiente', vence_at: vence, entrega_estimada: '', total_plataforma: 10000,
        prueba: false, sin_reconocer: [], acciones: { aceptar: true, rechazar: true, listo: true, retirado: true } },
    }]));
  }, { ahora, vence });
  await entrar(page, 'Admin');
  await page.goto(`${BASE}/#/caja`);
  await page.getByPlaceholder('Ej: 20000').fill('5000');
  await page.getByRole('button', { name: /Abrir caja/ }).click();

  // Aviso en cualquier pantalla mientras está sin aceptar.
  await page.goto(`${BASE}/#/dashboard`);
  await page.getByRole('link', { name: '1 pedido de PedidosYa sin aceptar' }).click();
  await page.waitForTimeout(300);
  assert.match(page.url(), /#\/pedidos_delivery$/);
  await page.getByText(/Vence \d\d:\d\d/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Aceptar' }).count(), 1);

  // Lo pagado en la app no aparece para cobrar en caja.
  await page.goto(`${BASE}/#/cobros`);
  await page.getByText('No hay pedidos por cobrar').waitFor();
  assert.equal(await page.getByText(/PedidosYa #42/).count(), 0);

  // Ya aceptado (en demo no hay servidor): se finaliza como saldo de PedidosYa.
  await page.evaluate(() => {
    const pedidos = JSON.parse(localStorage.getItem('restaurant-demo-pedidos'));
    pedidos[0].externo.estado_plataforma = 'aceptado';
    pedidos[0].estado = 'en_preparacion';
    localStorage.setItem('restaurant-demo-pedidos', JSON.stringify(pedidos));
  });
  await page.goto(`${BASE}/#/pedidos_delivery`);
  await page.reload();
  await page.getByRole('button', { name: 'Finalizar pedido' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.waitForTimeout(300);

  const estado = await page.evaluate(() => ({
    pedido: JSON.parse(localStorage.getItem('restaurant-demo-pedidos'))[0],
    pan: JSON.parse(localStorage.getItem('restaurant-demo-ingredientes'))[0].stock_actual,
    cuenta: JSON.parse(localStorage.getItem('restaurant-cuentas-dinero')).find(c => c.id === 'cuenta-pedidosya'),
  }));
  assert.equal(estado.pedido.estado, 'cobrado');
  assert.equal(estado.pan, 8);
  assert.equal(estado.cuenta.saldo, 10000);
  assert.deepEqual(errores, []);
  await context.close();
});

// Mesa M2 con tres desayunos ya entregados: $14.190.
const sembrarMesaServida = async (page, extra = {}) => {
  await sembrarCarta(page);
  const ahora = new Date().toISOString();
  await page.evaluate(({ ahora, extra }) => {
    const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const mesa = { id: 'mesa-2', numero: 2, nombre: 'M2', capacidad: 4, estado: 'ocupada', sector: 'salon', posicion_x: 0, posicion_y: 0,
      activa: true, created_at: ahora, updated_at: ahora };
    set('restaurant-mesas', [mesa]);
    const item = (id, precio) => ({ id, pedido_id: 'ped-m2', producto_id: `prod-${id}`, cantidad: 1, precio_unitario: precio, subtotal: precio,
      observaciones: '', estado: 'entregado', created_at: ahora, updated_at: ahora, entregado_at: ahora, producto: { id: `prod-${id}`, nombre: `Desayuno ${id}` } });
    set('restaurant-demo-pedidos', [{ id: 'ped-m2', mesa_id: 'mesa-2', empleado_id: 'moza-1', cantidad_personas: 3, estado: 'entregado',
      subtotal: 14190, descuento: 0, recargo: 0, total: 14190, observaciones: '', hora_apertura: ahora, created_at: ahora, updated_at: ahora,
      mesa, empleado: { id: 'moza-1', nombre: 'María', apellido: 'López', rol: 'moza' },
      items: [item('a', 4730), item('b', 4730), item('c', 4730)], ...extra }]);
  }, { ahora, extra });
};

const leerStore = (page, clave) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), clave);

/** Caja en una pestaña y la moza en otra del mismo navegador: los cambios pasan de una a otra solos. */
const cajaYMoza = async () => {
  const { context, page: caja, errores } = await sesion();
  await sembrarMesaServida(caja);
  await entrar(caja, 'Caja');
  await caja.getByPlaceholder('Ej: 20000').fill('10000');
  await caja.getByRole('button', { name: /Abrir caja/ }).click();
  await caja.goto(`${BASE}/#/cobros`);
  await caja.getByText('Por cobrar', { exact: true }).first().waitFor();

  const moza = await context.newPage();
  moza.on('pageerror', e => errores.push(e.message));
  await moza.goto(BASE);
  await moza.evaluate(() => localStorage.removeItem('demo_user'));
  await entrar(moza, 'Moza');
  await moza.getByRole('button', { name: /M2/ }).first().click();
  return { context, caja, moza, errores };
};

test('cobro en dos manos: la moza lo pide, caja imprime el ticket y confirma el pago', async () => {
  const { context, caja, moza, errores } = await cajaYMoza();

  // Todo entregado: en lugar de "Sin productos nuevos para enviar" están los dos botones.
  assert.equal(await moza.getByText('Sin productos nuevos para enviar').count(), 0);
  await moza.getByRole('button', { name: 'Editar / Agregar productos' }).waitFor();
  await moza.getByRole('button', { name: 'Cobrar comanda' }).click();
  const dialogo = moza.getByRole('dialog', { name: 'Cobrar comanda' });
  await dialogo.getByText('$14.190').first().waitFor();
  assert.equal(await dialogo.getByRole('button', { name: 'Enviar solicitud a Caja' }).isDisabled(), true, 'sin medio elegido no se manda');
  await dialogo.getByRole('button', { name: 'Efectivo' }).click();
  await dialogo.getByRole('button', { name: 'Enviar solicitud a Caja' }).dblclick();
  await moza.getByRole('button', { name: 'Cobro solicitado', exact: true }).waitFor();
  assert.equal(await moza.getByRole('button', { name: 'Cobro solicitado', exact: true }).isDisabled(), true);
  assert.equal(await moza.getByRole('button', { name: 'Editar / Agregar productos' }).isDisabled(), true);

  let [pedido] = await leerStore(moza, 'restaurant-demo-pedidos');
  assert.equal(pedido.estado, 'entregado', 'pedir el cobro no la cierra');
  assert.equal(pedido.solicitud_cobro.estado, 'solicitado');
  assert.equal(pedido.solicitud_cobro.solicitada_por_nombre, 'María López');
  assert.equal(pedido.historial.filter(e => e.tipo === 'cobro_solicitado').length, 1, 'el doble clic no manda dos');

  // Caja la recibe sin recargar.
  const enLista = caja.getByRole('button', { name: /M2/ }).first();
  await enLista.getByText('Cobro solicitado').waitFor();
  await enLista.click();
  await caja.getByText('María López').first().waitFor();
  const [ticket] = await Promise.all([caja.waitForEvent('popup'), caja.getByRole('button', { name: 'Imprimir ticket' }).click()]);
  await ticket.waitForLoadState();
  const textoTicket = await ticket.locator('body').innerText();
  assert.match(textoTicket, /NO VÁLIDO COMO FACTURA/);
  assert.match(textoTicket, /14\.190/);
  assert.match(textoTicket, /Efectivo/);
  await caja.getByText('Ticket emitido').first().waitFor();
  [pedido] = await leerStore(caja, 'restaurant-demo-pedidos');
  assert.equal(pedido.solicitud_cobro.estado, 'ticket_emitido');
  assert.equal(pedido.solicitud_cobro.ticket.total, 14190);
  assert.equal(await caja.getByRole('button', { name: 'Débito', exact: true }).isDisabled(), true, 'con ticket impreso no se cambia el medio');
  await moza.getByText(/Caja imprimió el ticket/).waitFor();

  // Caja confirma el pago. Los desayunos no tienen receta: el sistema pide confirmar dos veces, como siempre.
  const confirmar = caja.getByRole('button', { name: /Confirmar pago recibido \$14\.190/ });
  await confirmar.click();
  await caja.getByText(/no descuentan stock/).waitFor();
  await confirmar.dblclick();
  await caja.getByText('Pago registrado').waitFor();
  await caja.getByRole('button', { name: 'Finalizar sin imprimir' }).click();

  const [pagos, pedidos, mesas, cajas] = await Promise.all(['restaurant-pagos', 'restaurant-demo-pedidos', 'restaurant-mesas', 'restaurant-cajas-diarias'].map(k => leerStore(caja, k)));
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].id, `pago-${pedido.solicitud_cobro.id.replace(/^sol-/, '')}`);
  assert.equal(pagos[0].metodo_pago, 'efectivo');
  assert.equal(pagos[0].total_cobrado, 14190);
  assert.equal(pagos[0].cajero_id, 'caj-1');
  assert.equal(pedidos[0].estado, 'cobrado');
  assert.equal(pedidos[0].solicitud_cobro.estado, 'pagada');
  assert.equal(pedidos[0].solicitud_cobro.resuelta_por_nombre, 'Ana Rodríguez');
  assert.equal(mesas[0].estado, 'libre');
  assert.equal(cajas[0].total_ventas, 14190);
  assert.equal(cajas[0].efectivo, 14190);
  await moza.getByText('M2: pagada').waitFor();
  assert.deepEqual(errores, []);
  await context.close();
});

test('caja devuelve el cobro con motivo y la moza corrige, agrega y vuelve a pedir', async () => {
  const { context, caja, moza, errores } = await cajaYMoza();
  await moza.getByRole('button', { name: 'Cobrar comanda' }).click();
  await moza.getByRole('dialog').getByRole('button', { name: 'Mercado Pago' }).click();
  await moza.getByRole('dialog').getByRole('button', { name: 'Enviar solicitud a Caja' }).click();

  const enLista = caja.getByRole('button', { name: /M2/ }).first();
  await enLista.getByText('Cobro solicitado').waitFor();
  await enLista.click();
  await caja.getByRole('button', { name: 'Devolver a la moza' }).click();
  await caja.getByLabel('Motivo').fill('Falta cargar la bebida');
  await caja.getByRole('button', { name: 'Devolver', exact: true }).click();
  await moza.getByText('Falta cargar la bebida').waitFor();

  // Editar: se agrega solo lo nuevo, que no le llega a cocina hasta mandarlo.
  await moza.getByRole('button', { name: 'Editar / Agregar productos' }).click();
  await moza.getByRole('button', { name: /^Hamburguesa [$]/ }).click();
  await moza.getByText('Sin enviar').waitFor();
  await moza.getByText('$19.190').first().waitFor();
  assert.equal(await moza.getByRole('button', { name: 'Cobrar comanda' }).count(), 0, 'con algo sin enviar, primero se envía');
  let [pedido] = await leerStore(moza, 'restaurant-demo-pedidos');
  assert.equal(pedido.items.filter(i => i.estado === 'entregado').length, 3, 'lo entregado no se toca');
  await moza.getByRole('button', { name: 'Enviar a Cocina' }).click();
  await moza.getByRole('button', { name: 'Cobrar comanda' }).waitFor();
  [pedido] = await leerStore(moza, 'restaurant-demo-pedidos');
  assert.equal(pedido.items.filter(i => i.sin_enviar).length, 0);
  assert.equal(pedido.total, 19190);
  assert.equal(pedido.historial.at(-1).detalle, '1x Hamburguesa', 'a cocina va solo lo nuevo');

  await moza.getByRole('button', { name: 'Cobrar comanda' }).click();
  await moza.getByRole('dialog').getByText('$19.190').first().waitFor();
  await moza.getByRole('dialog').getByRole('button', { name: 'Mercado Pago' }).click();
  await moza.getByRole('dialog').getByRole('button', { name: 'Enviar solicitud a Caja' }).click();
  await moza.getByRole('button', { name: 'Cobro solicitado', exact: true }).waitFor();
  [pedido] = await leerStore(moza, 'restaurant-demo-pedidos');
  assert.equal(pedido.solicitud_cobro.total, 19190);
  assert.deepEqual(pedido.historial.map(e => e.tipo), ['cobro_solicitado', 'cobro_rechazado', 'enviado_cocina', 'cobro_solicitado']);

  // Caja cobra lo nuevo por Mercado Pago: entra al banco y queda registrado como Mercado Pago.
  await caja.getByRole('button', { name: /M2/ }).first().click();
  await caja.getByRole('button', { name: /Confirmar pago recibido \$19\.190/ }).click();
  await caja.getByText(/no descuentan stock/).waitFor();
  await caja.getByRole('button', { name: /Confirmar pago recibido \$19\.190/ }).click();
  await caja.getByText('Pago registrado').waitFor();
  const [pago] = await leerStore(caja, 'restaurant-pagos');
  assert.equal(pago.metodo_pago, 'mercado_pago');
  assert.equal(pago.monto_transferencia, 19190);
  assert.deepEqual(errores, []);
  await context.close();
});

test('cocina no ve lo cargado sin enviar; la moza no anula lo entregado, el encargado sí y con motivo', async () => {
  const { context, page, errores } = await sesion();
  await sembrarMesaServida(page, { estado: 'en_preparacion' });
  await page.evaluate(() => {
    const pedidos = JSON.parse(localStorage.getItem('restaurant-demo-pedidos'));
    const ahora = new Date().toISOString();
    pedidos[0].items.push({ id: 'x', pedido_id: 'ped-m2', producto_id: 'prod-burger', cantidad: 1, precio_unitario: 5000, subtotal: 5000,
      observaciones: '', estado: 'en_preparacion', created_at: ahora, updated_at: ahora, producto: { id: 'prod-burger', nombre: 'Hamburguesa' } });
    pedidos[0].items.push({ id: 'y', pedido_id: 'ped-m2', producto_id: 'prod-agua', cantidad: 1, precio_unitario: 1000, subtotal: 1000,
      observaciones: '', estado: 'pendiente', sin_enviar: true, created_at: ahora, updated_at: ahora, producto: { id: 'prod-agua', nombre: 'Agua sin gas' } });
    localStorage.setItem('restaurant-demo-pedidos', JSON.stringify(pedidos));
  });
  await entrar(page, 'Encargado');
  await page.goto(`${BASE}/#/cocina`);
  await page.getByText('Comandas Activas', { exact: true }).waitFor();
  await page.waitForTimeout(300);
  const cocina = await page.locator('main').innerText();
  assert.match(cocina, /Hamburguesa/, 'lo enviado sí lo ve');
  assert.doesNotMatch(cocina, /Agua sin gas/, 'lo no enviado no');

  await page.goto(`${BASE}/#/ventas`);
  await page.getByRole('button', { name: /M2/ }).first().click();
  await page.getByRole('button', { name: 'Anular Desayuno a' }).click();
  await page.getByLabel('Motivo').fill('Se cayó el plato');
  await page.getByRole('button', { name: 'Anular producto' }).click();
  await page.getByText(/Anulado por Diego Fernández: Se cayó el plato/).waitFor();
  const [pedido] = await leerStore(page, 'restaurant-demo-pedidos');
  assert.equal(pedido.items.find(i => i.id === 'a').estado, 'cancelado');
  assert.equal(pedido.total, 9460 + 5000 + 1000);
  assert.equal(pedido.historial.at(-1).tipo, 'item_anulado');

  await page.evaluate(() => localStorage.removeItem('demo_user'));
  await entrar(page, 'Moza');
  await page.getByRole('button', { name: /M2/ }).first().click();
  await page.getByText('Desayuno b').waitFor();
  assert.equal(await page.getByRole('button', { name: /^Anular / }).count(), 0, 'la moza no ve anular');
  assert.deepEqual(errores, []);
  await context.close();
});
