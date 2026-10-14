import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';

/*
  Función de PedidosYa (supabase/functions/pedidosya) con datos en memoria y una API de
  PedidosYa simulada. No se conecta a nada real.
*/
const compiled = await build({
  entryPoints: ['supabase/functions/pedidosya/manejador.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const mod = new Module(path.resolve('tests/pedidosya.compiled.cjs'));
mod.filename = path.resolve('tests/pedidosya.compiled.cjs');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { crearManejador } = mod.exports;

const SECRETO = 'secreto-de-prueba';
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const firmar = (payload, secreto = SECRETO, alg = 'HS512') => {
  const cabecera = b64({ typ: 'JWT', alg });
  const cuerpo = b64(payload);
  const firma = crypto.createHmac('sha512', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
};
const JWT_OK = `Bearer ${firmar({ service: 'middleware' })}`;

let datos, llamadas, handler, perfiles;

const orden = (extra = {}) => ({
  token: 'tok-1',
  code: 'ab12-cd34',
  shortCode: '42',
  createdAt: '2026-10-14T20:00:00.000Z',
  expiryDate: '2026-10-14T20:15:00.000Z',
  expeditionType: 'delivery',
  test: false,
  comments: { customerComment: 'Sin cebolla' },
  customer: { firstName: 'Ana', lastName: 'Gómez', mobilePhone: '+54 11 5555' },
  delivery: { address: null, expectedDeliveryTime: '2026-10-14T20:50:00.000Z', riderPickupTime: '2026-10-14T20:30:00.000Z' },
  payment: { status: 'paid', type: 'online' },
  price: { grandTotal: '15000.00', payRestaurant: '' },
  products: [
    { id: 'p1', remoteCode: 'COMBO-1', name: 'Combo Clásico', quantity: '2', unitPrice: '5000', paidPrice: '10000.00',
      selectedToppings: [{ name: 'Extra cheddar', quantity: 1 }] },
    { id: 'p2', remoteCode: '', name: 'papas fritas', quantity: '1', unitPrice: '3000', paidPrice: '3000' },
    { id: 'p3', remoteCode: 'XYZ', name: 'Gaseosa 500', quantity: '1', unitPrice: '2000', paidPrice: '2000' },
  ],
  callbackUrls: {
    orderAcceptedUrl: 'https://pya.test/v2/order/status/tok-1',
    orderRejectedUrl: 'https://pya.test/v2/order/status/tok-1',
    orderPickedUpUrl: 'https://pya.test/v2/order/status/tok-1',
    orderPreparedUrl: 'https://pya.test/v2/orders/tok-1/preparation-completed',
  },
  ...extra,
});

beforeEach(() => {
  const pedidosPlataforma = new Map();
  const pedidos = new Map();
  perfiles = {
    'jwt-cajero': { rol: 'cajero', local_id: 'local-1', activo: true },
    'jwt-moza': { rol: 'moza', local_id: 'local-1', activo: true },
    'jwt-otro-local': { rol: 'admin', local_id: 'local-2', activo: true },
  };
  datos = {
    escrituras: 0,
    pedidos,
    pedidosPlataforma,
    localPorRemoteId: async id => (id === 'BURGER_001' ? { local_id: 'local-1', activo: true } : null),
    pedidoPlataformaPorToken: async token => pedidosPlataforma.get(token) || null,
    pedidoPlataformaPorId: async id => [...pedidosPlataforma.values()].find(f => f.pedido_id === id) || null,
    guardarPedidoPlataforma: async fila => { pedidosPlataforma.set(fila.token, structuredClone(fila)); },
    actualizarEstadoPlataforma: async (token, estado) => { pedidosPlataforma.get(token).ultimo_estado = estado; },
    catalogo: async () => [
      { id: 'prod-combo', codigo: 'COMBO-1', nombre: 'Combo Clásico' },
      { id: 'prod-papas', codigo: 'PAP', nombre: 'Papas Fritas' },
    ],
    leerPedido: async (local, id) => structuredClone(pedidos.get(`${local}|${id}`) || null),
    escribirPedido: async (local, pedido) => { datos.escrituras += 1; pedidos.set(`${local}|${pedido.id}`, structuredClone(pedido)); },
    perfilDesdeSesion: async jwt => perfiles[jwt] || null,
  };
  llamadas = [];
  const fetchFalso = async (url, opciones = {}) => {
    llamadas.push({ url, ...opciones, body: opciones.body?.toString?.() ?? opciones.body });
    if (url.endsWith('/v2/login')) return new Response(JSON.stringify({ access_token: 'tok-api', expires_in: 1800, token_type: 'bearer' }));
    return new Response(JSON.stringify({ message: 'Order status successfully changed.' }));
  };
  handler = crearManejador(datos, { secreto: SECRETO, usuario: 'u', clave: 'c', api: 'https://pya.test' }, fetchFalso);
});

const pedir = (metodo, ruta, cuerpo, auth = JWT_OK) => handler(new Request(`https://x.supabase.co/functions/v1/pedidosya${ruta}`, {
  method: metodo,
  headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
  body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
}));

test('rechaza llamadas sin la firma de PedidosYa', async () => {
  assert.equal((await pedir('POST', '/order/BURGER_001', orden(), null)).status, 401);
  assert.equal((await pedir('POST', '/order/BURGER_001', orden(), `Bearer ${firmar({ service: 'middleware' }, 'otro')}`)).status, 401);
  assert.equal((await pedir('POST', '/order/BURGER_001', orden(), `Bearer ${firmar({ service: 'otro' })}`)).status, 401);
  assert.equal((await pedir('POST', '/order/BURGER_001', orden(), `Bearer ${firmar({ service: 'middleware' }, SECRETO, 'HS256')}`)).status, 401);
  assert.equal((await pedir('POST', '/order/BURGER_001', orden(), `Bearer ${firmar({ service: 'middleware', exp: 1 })}`)).status, 401);
  assert.equal(datos.escrituras, 0);
});

test('un pedido nuevo se guarda, se traduce y responde el remoteOrderId', async () => {
  const respuesta = await pedir('POST', '/order/BURGER_001', orden());
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.remoteResponse.remoteOrderId, 'ped-pya-tok-1');

  const pedido = datos.pedidos.get('local-1|ped-pya-tok-1');
  assert.equal(pedido.canal, 'pedidosya');
  assert.equal(pedido.estado, 'abierto');
  assert.equal(pedido.externo.estado_plataforma, 'pendiente');
  assert.equal(pedido.externo.tipo_entrega, 'delivery_plataforma');
  assert.equal(pedido.cobro, 'plataforma');
  assert.equal(pedido.total, 15000);
  assert.equal(pedido.subtotal, 15000);
  assert.equal(pedido.cliente_nombre, 'Ana Gómez');
  assert.deepEqual(pedido.items.map(i => i.producto_id), ['prod-combo', 'prod-papas', 'pya-XYZ']);
  assert.equal(pedido.items[0].cantidad, 2);
  assert.match(pedido.items[0].observaciones, /Extra cheddar/);
  assert.deepEqual(pedido.externo.sin_reconocer, ['Gaseosa 500']);
});

test('si PedidosYa reintenta el mismo pedido no se duplica', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  const segunda = await pedir('POST', '/order/BURGER_001', orden());
  assert.equal(segunda.status, 200);
  assert.equal((await segunda.json()).remoteResponse.remoteOrderId, 'ped-pya-tok-1');
  assert.equal(datos.escrituras, 1);
});

test('un local desconocido o un pedido incompleto se rechazan con 400', async () => {
  const desconocido = await pedir('POST', '/order/OTRO', orden());
  assert.equal(desconocido.status, 400);
  assert.equal((await desconocido.json()).reason, 'MENU_ACCOUNT_SETTINGS');
  assert.equal((await pedir('POST', '/order/BURGER_001', { token: 'x' })).status, 400);
});

test('integración indirecta (sin URL para aceptar): entra directo a cocina', async () => {
  await pedir('POST', '/order/BURGER_001', orden({ callbackUrls: {} }));
  const pedido = datos.pedidos.get('local-1|ped-pya-tok-1');
  assert.equal(pedido.estado, 'en_preparacion');
  assert.equal(pedido.externo.estado_plataforma, 'aceptado');
});

test('retiro en el local y pago pendiente: se cobra en caja', async () => {
  await pedir('POST', '/order/BURGER_001', orden({ expeditionType: 'pickup', payment: { status: 'pending', type: 'cash' }, delivery: null }));
  const pedido = datos.pedidos.get('local-1|ped-pya-tok-1');
  assert.equal(pedido.externo.tipo_entrega, 'retiro');
  assert.equal(pedido.cobro, 'caja');
});

test('repartidor propio del local: trae la dirección de entrega', async () => {
  await pedir('POST', '/order/BURGER_001', orden({
    delivery: { address: { street: 'Av. Corrientes', number: '1234', city: 'CABA' }, riderPickupTime: null },
  }));
  const pedido = datos.pedidos.get('local-1|ped-pya-tok-1');
  assert.equal(pedido.externo.tipo_entrega, 'delivery_local');
  assert.equal(pedido.direccion_entrega, 'Av. Corrientes 1234, CABA');
});

test('cancelación de PedidosYa: el pedido queda cancelado', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  const r = await pedir('PUT', '/remoteId/BURGER_001/remoteOrder/ped-pya-tok-1/posOrderStatus', { status: 'ORDER_CANCELLED', message: 'Cliente canceló' });
  assert.equal(r.status, 200);
  const pedido = datos.pedidos.get('local-1|ped-pya-tok-1');
  assert.equal(pedido.estado, 'cancelado');
  assert.equal(pedido.externo.estado_plataforma, 'cancelado');
  assert.match(pedido.observaciones, /Cliente canceló/);
  assert.equal((await pedir('PUT', '/remoteId/BURGER_001/remoteOrder/no-existe/posOrderStatus', { status: 'ORDER_CANCELLED' })).status, 404);
});

test('aceptar: inicia sesión en PedidosYa y avisa con la hora estimada', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  const antes = Date.now();
  const r = await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'aceptar', minutos: 25 }, 'Bearer jwt-cajero');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).estado, 'aceptado');

  assert.equal(llamadas[0].url, 'https://pya.test/v2/login');
  assert.match(llamadas[0].body, /grant_type=client_credentials/);
  const aviso = llamadas[1];
  assert.equal(aviso.url, 'https://pya.test/v2/order/status/tok-1');
  assert.equal(aviso.headers.Authorization, 'Bearer tok-api');
  const enviado = JSON.parse(aviso.body);
  assert.equal(enviado.status, 'order_accepted');
  assert.equal(enviado.remoteOrderId, 'ped-pya-tok-1');
  assert.ok(Date.parse(enviado.acceptanceTime) >= antes + 24 * 60_000, 'respeta los minutos pedidos');
  assert.equal(datos.pedidosPlataforma.get('tok-1').ultimo_estado, 'aceptado');

  // El token de la API se reutiliza.
  await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'listo' }, 'Bearer jwt-cajero');
  assert.equal(llamadas.filter(l => l.url.endsWith('/v2/login')).length, 1);
});

test('rechazar manda un motivo válido de PedidosYa', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'rechazar', motivo: 'ITEM_UNAVAILABLE' }, 'Bearer jwt-cajero');
  assert.equal(JSON.parse(llamadas[1].body).reason, 'ITEM_UNAVAILABLE');
  await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'rechazar', motivo: 'CUALQUIERA' }, 'Bearer jwt-cajero');
  assert.equal(JSON.parse(llamadas[2].body).reason, 'TOO_BUSY');
});

test('solo admin, encargado o cajero del mismo local pueden operar', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  assert.equal((await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'aceptar' }, 'Bearer jwt-moza')).status, 403);
  assert.equal((await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'aceptar' }, 'Bearer jwt-otro-local')).status, 404);
  assert.equal((await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'aceptar' }, null)).status, 401);
  assert.equal(llamadas.length, 0);
});

test('si PedidosYa responde error, se informa y no se marca como hecho', async () => {
  await pedir('POST', '/order/BURGER_001', orden());
  handler = crearManejador(datos, { secreto: SECRETO, usuario: 'u', clave: 'c', api: 'https://pya.test' }, async url => (
    url.endsWith('/v2/login')
      ? new Response(JSON.stringify({ access_token: 't', expires_in: 1800 }))
      : new Response(JSON.stringify({ code: 'INVALID_REQUEST', currentState: 'WAITING_FOR_ACKNOWLEDGEMENT' }), { status: 409 })
  ));
  const r = await pedir('POST', '/accion', { pedido_id: 'ped-pya-tok-1', accion: 'aceptar' }, 'Bearer jwt-cajero');
  assert.equal(r.status, 502);
  assert.equal((await r.json()).reintentar, true);
  assert.equal(datos.pedidosPlataforma.get('tok-1').ultimo_estado, 'pendiente');
});

test('acepta el token de ejemplo de la documentación oficial (firmado con "123")', async () => {
  const ejemplo = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJzZXJ2aWNlIjoibWlkZGxld2FyZSJ9.'
    + 'VKb-yT2Zz2e4j7R5ssXzU0Mj5MrQ7yxP1H1YRPFmlVANhOYwadSk-5GepYUBz19KASD0QjwLTWtOKLR63Y_R9g';
  const conClaveDeEjemplo = crearManejador(datos, { secreto: '123', usuario: 'u', clave: 'c', api: 'https://pya.test' });
  const r = await conClaveDeEjemplo(new Request('https://x.supabase.co/functions/v1/pedidosya/remoteId/BURGER_001/availability', {
    method: 'PUT', headers: { Authorization: `Bearer ${ejemplo}` }, body: JSON.stringify({ timestamp: '2026-10-14T00:00:00Z', closures: [] }),
  }));
  assert.equal(r.status, 200);
});
