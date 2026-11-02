import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { build } from 'esbuild';
import forge from 'node-forge';

/*
  Función de ARCA (supabase/functions/arca) con datos en memoria y ARCA simulado por SOAP.
  No se conecta a nada real.
*/
const compilar = async entrada => {
  const compiled = await build({
    stdin: { contents: entrada, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{
      name: 'npm-de-deno',
      setup(b) {
        b.onResolve({ filter: /^npm:node-forge/ }, () => ({ path: 'node-forge', external: true }));
      },
    }],
  });
  const archivo = path.resolve('tests/arca.compiled.cjs');
  const mod = new Module(archivo);
  mod.filename = archivo;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod._compile(compiled.outputFiles[0].text, archivo);
  return mod.exports;
};

const { crearManejador, crearClienteArca, reglas, firmarConCertificado } = await compilar(`
  export { crearManejador } from './supabase/functions/arca/manejador.ts';
  export { crearClienteArca } from './supabase/functions/arca/cliente.ts';
  export { firmarConCertificado } from './supabase/functions/arca/firma.ts';
  export * as reglas from './supabase/functions/arca/reglas.ts';
`);

const CUIT = '20111111112';
let filas, config, ultimo, llamadas, comportamiento, turnoOcupado, handler;

const responder = xml => new Response(`<?xml version="1.0"?><soap:Envelope xmlns:soap="s"><soap:Body>${xml}</soap:Body></soap:Envelope>`, { status: 200 });
const campo = (xml, nombre) => xml.match(new RegExp(`<${nombre}>([^<]*)</${nombre}>`))?.[1];

const fetchFalso = async (url, init) => {
  const accion = init.headers.SOAPAction;
  const cuerpo = init.body;
  llamadas.push({ url, accion, cuerpo });
  if (url.includes('LoginCms')) {
    const ticket = '<loginTicketResponse><credentials><token>TOK</token><sign>FIR</sign></credentials><header><expirationTime>2099-01-01T00:00:00Z</expirationTime></header></loginTicketResponse>'
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return responder(`<loginCmsResponse><loginCmsReturn>${ticket}</loginCmsReturn></loginCmsResponse>`);
  }
  if (accion.includes('FECompUltimoAutorizado')) {
    const tipo = Number(campo(cuerpo, 'CbteTipo'));
    return responder(`<R><CbteNro>${ultimo[tipo] || 0}</CbteNro></R>`);
  }
  if (accion.includes('FECompConsultar')) {
    if (comportamiento.consulta) return responder(comportamiento.consulta);
    return responder('<R><Errors><Err><Code>602</Code><Msg>No existe</Msg></Err></Errors></R>');
  }
  if (comportamiento.solicitar) {
    const r = comportamiento.solicitar(cuerpo);
    if (r) return r;
  }
  const tipo = Number(campo(cuerpo, 'CbteTipo'));
  ultimo[tipo] = Number(campo(cuerpo, 'CbteDesde'));
  return responder(`<R><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>7${ultimo[tipo]}</CAE><CAEFchVto>20991231</CAEFchVto></FECAEDetResponse></FeDetResp></R>`);
};

const datos = {
  perfilDesdeSesion: async jwt => jwt === 'moza'
    ? { rol: 'moza', local_id: 'L1', activo: true }
    : { rol: 'cajero', local_id: jwt === 'otro' ? 'L2' : 'L1', activo: true },
  config: async local => (local === 'L1' ? config : null),
  buscarPorPago: async (local, pago, clase) => filas.find(f => f.local_id === local && f.pago_id === pago && f.clase === clase) || null,
  buscarPorId: async id => filas.find(f => f.id === id) || null,
  autorizadoConNumero: async (c, n) => filas.find(f => f.id !== c.id && f.estado === 'autorizado' && f.numero === n && f.cbte_tipo === c.cbte_tipo) || null,
  crear: async c => {
    const fila = { ...c, id: `c${filas.length + 1}` };
    filas.push(fila);
    return fila;
  },
  actualizar: async (id, cambios) => {
    const fila = filas.find(f => f.id === id);
    Object.assign(fila, cambios);
    return fila;
  },
  tomarTurno: async () => !turnoOcupado,
  soltarTurno: async () => {},
};

const pedir = async (ruta, cuerpo, jwt = 'caja') => {
  const r = await handler(new Request(`https://x.test/functions/v1/arca/${ruta}`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(cuerpo),
  }));
  return { status: r.status, ...(await r.json()) };
};

const cf = { nombre: 'Consumidor final', condicion_iva: 5, doc_tipo: 99, doc_nro: '0' };

beforeEach(() => {
  filas = []; ultimo = {}; llamadas = []; comportamiento = {}; turnoOcupado = false;
  config = {
    local_id: 'L1', cuit: CUIT, razon_social: 'Burger SA', domicilio: 'Calle 1', ingresos_brutos: '', inicio_actividades: null,
    condicion_emisor: 'responsable_inscripto', punto_venta: 3, alicuota: 21, concepto: 1, umbral_identificacion: 10000000, activo: true,
  };
  let token = null;
  const cliente = crearClienteArca({
    ambiente: 'homologacion', firmar: () => 'CMS', fetchApi: fetchFalso,
    tokens: { leer: async () => token, guardar: async (_, a) => { token = a; } },
  });
  handler = crearManejador(datos, cliente, 'homologacion', async () => {});
});

test('Responsable inscripto a consumidor final: Factura B con condición de IVA e importes que cierran', async () => {
  const r = await pedir('emitir', { pago_id: 'p1', total: 12100, receptor: cf });
  assert.equal(r.status, 200);
  const c = r.comprobante;
  assert.equal(c.estado, 'autorizado');
  assert.equal(c.cbte_tipo, 6);
  assert.equal(c.numero, 1);
  assert.equal(c.cae, '71');
  assert.equal(c.neto, 10000);
  assert.equal(c.iva, 2100);
  const envio = llamadas.find(l => l.accion?.includes('FECAESolicitar')).cuerpo;
  assert.equal(campo(envio, 'CondicionIVAReceptorId'), '5');
  assert.equal(campo(envio, 'DocTipo'), '99');
  assert.equal(campo(envio, 'ImpTotal'), '12100.00');
  assert.match(envio, /<Iva><AlicIva><Id>5<\/Id><BaseImp>10000.00<\/BaseImp><Importe>2100.00<\/Importe>/);
  // El orden del WSDL importa.
  assert.ok(envio.indexOf('<MonId>') < envio.indexOf('<CondicionIVAReceptorId>'));
  assert.ok(envio.indexOf('<CondicionIVAReceptorId>') < envio.indexOf('<Iva>'));
});

test('Neto más IVA da siempre el total exacto', () => {
  for (const total of [0.01, 99.99, 1234.57, 7777.77, 15000.33]) {
    const { neto, iva } = reglas.calcularImportes(total, 'responsable_inscripto', 21);
    assert.equal(Math.round((neto + iva) * 100) / 100, total);
  }
});

test('Monotributo emite Factura C sin IVA', async () => {
  config.condicion_emisor = 'monotributo';
  const { comprobante: c } = await pedir('emitir', { pago_id: 'p1', total: 5000, receptor: cf });
  assert.equal(c.cbte_tipo, 11);
  assert.equal(c.iva, 0);
  assert.equal(c.neto, 5000);
  const envio = llamadas.find(l => l.accion?.includes('FECAESolicitar')).cuerpo;
  assert.ok(!envio.includes('<Iva>'));
});

test('Inscripto a inscripto es Factura A y exige CUIT válido', async () => {
  const mal = await pedir('emitir', { pago_id: 'p1', total: 5000, receptor: { condicion_iva: 1, doc_tipo: 80, doc_nro: '20111111113' } });
  assert.equal(mal.status, 400);
  const sinCuit = await pedir('emitir', { pago_id: 'p1', total: 5000, receptor: { condicion_iva: 1, doc_tipo: 96, doc_nro: '30111222' } });
  assert.equal(sinCuit.status, 400);
  const bien = await pedir('emitir', { pago_id: 'p1', total: 5000, receptor: { condicion_iva: 1, doc_tipo: 80, doc_nro: '20-11111111-2' } });
  assert.equal(bien.comprobante.cbte_tipo, 1);
  assert.equal(bien.comprobante.doc_nro, CUIT);
});

test('Desde el umbral hay que identificar al consumidor final', async () => {
  const r = await pedir('emitir', { pago_id: 'p1', total: 10000000, receptor: cf });
  assert.equal(r.status, 400);
  assert.match(r.error, /identificar/);
  assert.equal(filas.length, 0);
});

test('Repetir el pedido no factura dos veces', async () => {
  await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  const r = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal(r.comprobante.numero, 1);
  assert.equal(llamadas.filter(l => l.accion?.includes('FECAESolicitar')).length, 1);
});

test('Si ARCA no responde queda pendiente con el número reservado', async () => {
  comportamiento.solicitar = () => { throw new TypeError('timeout'); };
  const r = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal(r.status, 200);
  assert.equal(r.comprobante.estado, 'pendiente');
  assert.equal(r.comprobante.numero, 1);
  assert.match(r.comprobante.error, /timeout/);
});

test('Reintento: si ARCA ya lo había autorizado recupera el CAE sin pedir otro', async () => {
  comportamiento.solicitar = () => { throw new TypeError('timeout'); };
  const { comprobante } = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  llamadas = [];
  comportamiento = { consulta: '<R><Resultado>A</Resultado><CodAutorizacion>999</CodAutorizacion><FchVto>20991231</FchVto><CbteFch>20261031</CbteFch><DocNro>0</DocNro><ImpTotal>1000</ImpTotal></R>' };
  const r = await pedir('reintentar', { id: comprobante.id });
  assert.equal(r.comprobante.estado, 'autorizado');
  assert.equal(r.comprobante.cae, '999');
  assert.equal(llamadas.filter(l => l.accion?.includes('FECAESolicitar')).length, 0);
});

test('Reintento: no adopta un comprobante ajeno con el mismo número e importe', async () => {
  comportamiento.solicitar = () => { throw new TypeError('timeout'); };
  const { comprobante: perdido } = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  comportamiento = {};
  await pedir('emitir', { pago_id: 'p2', total: 1000, receptor: cf });
  comportamiento = { consulta: '<R><Resultado>A</Resultado><CodAutorizacion>71</CodAutorizacion><FchVto>20991231</FchVto><CbteFch>20261031</CbteFch><DocNro>0</DocNro><ImpTotal>1000</ImpTotal></R>' };
  const r = await pedir('reintentar', { id: perdido.id });
  assert.equal(r.comprobante.numero, 2);
  assert.equal(r.comprobante.cae, '72');
});

test('Rechazo de ARCA: se informa el motivo, libera el número y se puede corregir', async () => {
  comportamiento.solicitar = () => responder('<R><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10242</Code><Msg>Condicion IVA invalida</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></R>');
  const r = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal(r.comprobante.estado, 'rechazado');
  assert.equal(r.comprobante.numero, null);
  assert.match(r.comprobante.error, /10242/);
  comportamiento = {};
  const corregido = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: { condicion_iva: 4, doc_tipo: 80, doc_nro: CUIT } });
  assert.equal(corregido.comprobante.estado, 'autorizado');
  assert.equal(corregido.comprobante.condicion_iva_receptor, 4);
});

test('Número ocupado (10016): vuelve a pedir el último y reintenta', async () => {
  let veces = 0;
  comportamiento.solicitar = () => {
    if (veces++ === 0) {
      ultimo[6] = 5;
      return responder('<R><Errors><Err><Code>10016</Code><Msg>Numero incorrecto</Msg></Err></Errors></R>');
    }
    return null;
  };
  const r = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal(r.comprobante.estado, 'autorizado');
  assert.equal(r.comprobante.numero, 6);
});

test('Otra caja con el turno: queda pendiente y no llama a ARCA', async () => {
  turnoOcupado = true;
  const r = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal(r.comprobante.estado, 'pendiente');
  assert.match(r.comprobante.error, /Otra caja/);
  assert.equal(llamadas.length, 0);
});

test('Nota de crédito: misma letra, asociada a la factura y sin duplicarse', async () => {
  const { comprobante: factura } = await pedir('emitir', { pago_id: 'p1', total: 12100, receptor: cf });
  const r = await pedir('nota-credito', { id: factura.id });
  const nota = r.comprobante;
  assert.equal(nota.estado, 'autorizado');
  assert.equal(nota.cbte_tipo, 8);
  assert.equal(nota.asociado_id, factura.id);
  const envio = llamadas.filter(l => l.accion?.includes('FECAESolicitar')).at(-1).cuerpo;
  assert.match(envio, /<CbtesAsoc><CbteAsoc><Tipo>6<\/Tipo><PtoVta>3<\/PtoVta><Nro>1<\/Nro><Cuit>20111111112<\/Cuit>/);
  const otra = await pedir('nota-credito', { id: factura.id });
  assert.equal(otra.comprobante.id, nota.id);
  assert.equal(llamadas.filter(l => l.accion?.includes('FECAESolicitar')).length, 2);
});

test('No se anula lo que no está autorizado y solo se descarta lo rechazado', async () => {
  comportamiento.solicitar = () => { throw new TypeError('timeout'); };
  const { comprobante } = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal((await pedir('nota-credito', { id: comprobante.id })).status, 400);
  assert.equal((await pedir('descartar', { id: comprobante.id })).status, 400);
});

test('Permisos: otro rol u otro local no pueden facturar', async () => {
  assert.equal((await pedir('emitir', { pago_id: 'p1', total: 1, receptor: cf }, 'moza')).status, 403);
  const { comprobante } = await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  assert.equal((await pedir('nota-credito', { id: comprobante.id }, 'otro')).status, 404);
});

test('El acceso a ARCA se reutiliza entre comprobantes', async () => {
  await pedir('emitir', { pago_id: 'p1', total: 1000, receptor: cf });
  await pedir('emitir', { pago_id: 'p2', total: 1000, receptor: cf });
  assert.equal(llamadas.filter(l => l.url.includes('LoginCms')).length, 1);
});

test('El QR lleva los datos que pide ARCA', () => {
  const url = reglas.urlQr({ fecha: '20261031', cuit: CUIT, punto_venta: 3, cbte_tipo: 6, numero: 7, total: 121, doc_tipo: 99, doc_nro: '0', cae: '71234567890123' });
  const datosQr = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString());
  assert.deepEqual(datosQr, {
    ver: 1, fecha: '2026-10-31', cuit: 20111111112, ptoVta: 3, tipoCmp: 6, nroCmp: 7, importe: 121, moneda: 'PES', ctz: 1,
    tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: 71234567890123,
  });
});

test('La firma del acceso es un CMS válido según OpenSSL, con el contenido incluido', t => {
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const sujeto = [{ name: 'commonName', value: 'burgerpos' }];
  cert.setSubject(sujeto);
  cert.setIssuer(sujeto);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  const firmado = firmarConCertificado(certPem, forge.pki.privateKeyToPem(claves.privateKey))('<hola>ñ</hola>');

  const dir = mkdtempSync(path.join(os.tmpdir(), 'arca-'));
  try {
    writeFileSync(path.join(dir, 'cms.der'), Buffer.from(firmado, 'base64'));
    writeFileSync(path.join(dir, 'cert.pem'), certPem);
    let salida;
    try {
      salida = execFileSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', path.join(dir, 'cms.der'), '-CAfile', path.join(dir, 'cert.pem'), '-purpose', 'any'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      if (error.code === 'ENOENT') return t.skip('Sin OpenSSL en este equipo');
      throw error;
    }
    assert.equal(salida.toString(), '<hola>ñ</hola>');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
