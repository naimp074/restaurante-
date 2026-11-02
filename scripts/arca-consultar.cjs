// Verifica una empresa contra ARCA producción sin emitir nada: nunca pide CAE ni imprime claves.
// Uso: node scripts/arca-consultar.cjs molinaparra 30718654919
// El acceso dura 12 horas y no se puede pedir otro: queda en arca-<nombre>.token.sql para cargarlo en Supabase.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');
const { build } = require('esbuild');

const [nombre, cuit] = process.argv.slice(2);
if (!nombre || !/^\d{11}$/.test(cuit || '')) {
  console.error('Uso: node scripts/arca-consultar.cjs <nombre> <cuit>');
  process.exit(1);
}

const openssl = (...args) => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const certificadoPem = `arca-${nombre}.crt`;
const clavePem = `arca-${nombre}.key`;

const compilar = async () => {
  const compiled = await build({
    stdin: {
      contents: `
        export { crearClienteArca } from './supabase/functions/arca/cliente.ts';
        export { firmarConCertificado } from './supabase/functions/arca/firma.ts';
      `,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'npm-de-deno', setup(b) { b.onResolve({ filter: /^npm:node-forge/ }, () => ({ path: 'node-forge', external: true })); } }],
  });
  const archivo = path.resolve('scripts/arca-consultar.compiled.cjs');
  const mod = new Module(archivo);
  mod.filename = archivo;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod._compile(compiled.outputFiles[0].text, archivo);
  return mod.exports;
};

(async () => {
  const sujeto = openssl('x509', '-in', certificadoPem, '-noout', '-subject');
  const emisor = openssl('x509', '-in', certificadoPem, '-noout', '-issuer');
  console.log('Certificado:', sujeto.trim());
  console.log('Emitido por:', emisor.trim());
  console.log('Vigencia:', openssl('x509', '-in', certificadoPem, '-noout', '-enddate').trim());
  const publicaCertificado = openssl('x509', '-in', certificadoPem, '-noout', '-pubkey');
  const publicaClave = openssl('pkey', '-in', clavePem, '-pubout');
  if (publicaCertificado.trim() !== publicaClave.trim()) throw new Error('El certificado y la clave no coinciden.');
  if (!sujeto.includes(`CUIT ${cuit}`)) throw new Error(`El certificado no es del CUIT ${cuit}.`);
  if (/Test/i.test(emisor)) throw new Error('Es un certificado de homologación, no de producción.');
  console.log('Certificado y clave coinciden.');

  const { crearClienteArca, firmarConCertificado } = await compilar();
  let acceso = null;
  const arca = crearClienteArca({
    ambiente: 'produccion',
    firmar: firmarConCertificado(fs.readFileSync(certificadoPem, 'utf8'), fs.readFileSync(clavePem, 'utf8')),
    tokens: {
      leer: async () => acceso,
      guardar: async (_ambiente, a) => {
        acceso = a;
        fs.writeFileSync(`arca-${nombre}.token.sql`, `INSERT INTO arca_tokens (ambiente, cuit, token, firma, vence) VALUES ('produccion', '${cuit}', '${a.token}', '${a.firma}', '${a.vence}') ON CONFLICT (ambiente, cuit) DO UPDATE SET token = EXCLUDED.token, firma = EXCLUDED.firma, vence = EXCLUDED.vence;\n`);
      },
    },
  });

  const puntos = await arca.puntosDeVenta(cuit);
  console.log('Acceso a WSAA y WSFEv1: bien. Vence', acceso.vence);
  console.log('Puntos de venta:', puntos.length ? '' : 'ninguno informado');
  for (const p of puntos) {
    const ultimos = [];
    for (const [tipo, letra] of [[1, 'A'], [6, 'B'], [11, 'C']]) {
      const numero = await arca.ultimoNumero(cuit, p.numero, tipo).catch(e => `error (${e.message.slice(0, 60)})`);
      ultimos.push(`${letra}=${numero}`);
    }
    console.log(`  ${p.numero} | ${p.tipo} | bloqueado ${p.bloqueado} | baja ${p.baja} | últimos ${ultimos.join(' ')}`);
  }
  const tipos = await arca.tiposDeComprobante(cuit);
  console.log('Tipos que informa ARCA:', tipos.filter(t => [1, 3, 6, 8, 11, 13].includes(t.id)).map(t => `${t.id}=${t.nombre}`).join(', '));
})().catch(error => {
  console.error('FALLA:', error.message);
  process.exit(1);
});
