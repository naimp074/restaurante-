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
