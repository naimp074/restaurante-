import { ErrorTemporal, type Ambiente, type ClienteArca } from './cliente.ts';
import {
  calcularImportes,
  fechaArgentina,
  idDeAlicuota,
  notaCreditoDe,
  problemaDelReceptor,
  tipoComprobante,
  urlQr,
  type CondicionEmisor,
  type Receptor,
} from './reglas.ts';

/**
 * Rutas que llama la caja (con la sesión del usuario):
 *   POST /emitir       { pago_id, total, receptor }  factura de un cobro (repetirla no duplica)
 *   POST /reintentar   { id }                        vuelve a intentar un comprobante pendiente o rechazado
 *   POST /nota-credito { id }                        anula una factura autorizada
 *   POST /descartar    { id }                        un rechazado que ya no se va a facturar
 */

export type ConfigFiscal = {
  local_id: string; cuit: string; razon_social: string; domicilio: string; ingresos_brutos: string;
  inicio_actividades: string | null; condicion_emisor: CondicionEmisor; punto_venta: number;
  alicuota: number; concepto: number; umbral_identificacion: number; activo: boolean;
};

export type Comprobante = {
  id: string; local_id: string; pago_id: string; clase: 'factura' | 'nota_credito'; asociado_id: string | null;
  ambiente: Ambiente; estado: 'pendiente' | 'autorizado' | 'rechazado' | 'descartado'; emisor: Partial<ConfigFiscal> & { cuit: string; condicion_emisor: CondicionEmisor };
  cbte_tipo: number; punto_venta: number; numero: number | null; fecha: string | null; concepto: number;
  doc_tipo: number; doc_nro: string; condicion_iva_receptor: number; receptor_nombre: string;
  total: number; neto: number; iva: number; alicuota: number;
  cae: string | null; cae_vencimiento: string | null; qr_url: string | null; error: string | null;
};

export type Perfil = { rol: string; local_id: string | null; activo: boolean };

/** Acceso a datos: en producción lo implementa index.ts con Supabase; en las pruebas, memoria. */
export interface Datos {
  perfilDesdeSesion(jwt: string): Promise<Perfil | null>;
  config(localId: string): Promise<ConfigFiscal | null>;
  buscarPorPago(localId: string, pagoId: string, clase: Comprobante['clase']): Promise<Comprobante | null>;
  buscarPorId(id: string): Promise<Comprobante | null>;
  /** Otro comprobante ya autorizado con ese número. */
  autorizadoConNumero(c: Comprobante, numero: number): Promise<Comprobante | null>;
  /** Si otro pedido lo creó primero (pago_id y clase repetidos), devuelve ese. */
  crear(c: Omit<Comprobante, 'id'>): Promise<Comprobante>;
  actualizar(id: string, cambios: Partial<Comprobante>): Promise<Comprobante>;
  tomarTurno(clave: string, segundos: number): Promise<boolean>;
  soltarTurno(clave: string): Promise<void>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const rolesQueFacturan = ['admin', 'encargado', 'cajero'];
const codigoNumeroIncorrecto = 10016;
const sinPermiso = 'Las credenciales de ARCA de ese CUIT no son de este local.';
const otroAmbiente = 'Ese comprobante es de otro ambiente de ARCA (prueba o producción) y no se puede operar desde este.';

/** Cliente y ambiente de un CUIT. local: el único que puede usarlos; sin definir, cualquiera. */
export type Entorno = { arca: ClienteArca; ambiente: Ambiente; local?: string };

const localPermitido = (entorno: Entorno, localId: string) => entorno.local === undefined || entorno.local === localId;

export const crearManejador = (datos: Datos, entornoDe: (cuit: string) => Entorno, dormir = (ms: number) => new Promise(r => setTimeout(r, ms))) => {
  const conTurno = async <T>(clave: string, trabajo: () => Promise<T>): Promise<T> => {
    for (let intento = 0; intento < 8; intento++) {
      if (await datos.tomarTurno(clave, 150)) {
        try {
          return await trabajo();
        } finally {
          await datos.soltarTurno(clave);
        }
      }
      await dormir(1000);
    }
    throw new ErrorTemporal('Otra caja está facturando. Reintentá en unos segundos.');
  };

  const autorizar = (c: Comprobante, numero: number, fecha: string, cae: string, vencimiento: string, aviso: string | null) =>
    datos.actualizar(c.id, {
      estado: 'autorizado', numero, fecha, cae, cae_vencimiento: vencimiento, error: aviso,
      qr_url: urlQr({
        fecha, cuit: c.emisor.cuit, punto_venta: c.punto_venta, cbte_tipo: c.cbte_tipo, numero,
        total: Number(c.total), doc_tipo: c.doc_tipo, doc_nro: c.doc_nro, cae,
      }),
    });

  /** Si se cortó justo después de pedir el CAE, puede estar autorizado aunque no nos enteramos. */
  const recuperarSiYaSeEmitio = async (c: Comprobante) => {
    if (!c.numero) return null;
    const emitido = await entornoDe(c.emisor.cuit).arca.consultar(c.emisor.cuit, c.punto_venta, c.cbte_tipo, c.numero);
    if (!emitido || emitido.resultado !== 'A') return null;
    const esEste = emitido.docNro === c.doc_nro && Math.abs(emitido.total - Number(c.total)) < 0.005;
    if (!esEste || await datos.autorizadoConNumero(c, c.numero)) return null;
    return autorizar(c, c.numero, emitido.fecha, emitido.cae, emitido.vencimiento, null);
  };

  const pedirCAE = async (c: Comprobante): Promise<Comprobante> => {
    const { arca } = entornoDe(c.emisor.cuit);
    const asociado = c.asociado_id ? await datos.buscarPorId(c.asociado_id) : null;
    if (c.asociado_id && (!asociado?.numero || !asociado.fecha)) throw new Error('No encontré la factura que hay que anular.');

    for (let intento = 0; intento < 2; intento++) {
      const numero = await arca.ultimoNumero(c.emisor.cuit, c.punto_venta, c.cbte_tipo) + 1;
      const fecha = fechaArgentina();
      // Se guarda antes de llamar: si la respuesta se pierde, el reintento sabe qué número buscar.
      await datos.actualizar(c.id, { numero, fecha, estado: 'pendiente' });

      const respuesta = await arca.solicitarCAE(c.emisor.cuit, c.punto_venta, c.cbte_tipo, {
        concepto: c.concepto, docTipo: c.doc_tipo, docNro: c.doc_nro, numero, fecha,
        total: Number(c.total), neto: Number(c.neto), iva: Number(c.iva),
        alicuotaId: Number(c.iva) > 0 || c.emisor.condicion_emisor === 'responsable_inscripto' ? idDeAlicuota(Number(c.alicuota)) : undefined,
        condicionIva: c.condicion_iva_receptor,
        asociado: asociado ? { tipo: asociado.cbte_tipo, puntoVenta: asociado.punto_venta, numero: asociado.numero!, cuit: c.emisor.cuit, fecha: asociado.fecha! } : undefined,
      });

      if (respuesta.resultado === 'A') return autorizar(c, numero, fecha, respuesta.cae, respuesta.vencimiento, respuesta.observaciones || null);
      if (intento === 0 && respuesta.errores.some(e => e.codigo === codigoNumeroIncorrecto)) continue;
      return datos.actualizar(c.id, {
        estado: 'rechazado', numero: null,
        error: respuesta.errores.map(e => `${e.codigo}: ${e.mensaje}`).join(' · '),
      });
    }
    throw new ErrorTemporal('ARCA no aceptó el número del comprobante. Reintentá en unos segundos.');
  };

  /** Autoriza el comprobante. Si ARCA no responde, queda pendiente con el motivo. */
  const procesar = async (c: Comprobante): Promise<Comprobante> => {
    if (c.estado === 'autorizado' || c.estado === 'descartado') return c;
    try {
      return await conTurno(`${entornoDe(c.emisor.cuit).ambiente}:${c.emisor.cuit}:${c.punto_venta}:${c.cbte_tipo}`, async () => {
        const actual = await datos.buscarPorId(c.id) || c;
        if (actual.estado === 'autorizado') return actual;
        return await recuperarSiYaSeEmitio(actual) || await pedirCAE(actual);
      });
    } catch (error) {
      if (error instanceof ErrorTemporal) return datos.actualizar(c.id, { estado: 'pendiente', error: error.message });
      return datos.actualizar(c.id, { estado: 'rechazado', numero: null, error: error instanceof Error ? error.message : 'Error desconocido.' });
    }
  };

  const camposDeFactura = (config: ConfigFiscal, receptor: Receptor, total: number) => {
    const importes = calcularImportes(total, config.condicion_emisor, Number(config.alicuota));
    return {
      emisor: {
        cuit: config.cuit, razon_social: config.razon_social, domicilio: config.domicilio,
        ingresos_brutos: config.ingresos_brutos, inicio_actividades: config.inicio_actividades,
        condicion_emisor: config.condicion_emisor,
      },
      cbte_tipo: tipoComprobante(config.condicion_emisor, receptor.condicion_iva, 'factura'),
      punto_venta: config.punto_venta,
      concepto: config.concepto,
      doc_tipo: receptor.doc_tipo,
      doc_nro: receptor.doc_nro.replace(/\D/g, '') || '0',
      condicion_iva_receptor: receptor.condicion_iva,
      receptor_nombre: (receptor.nombre || 'Consumidor final').slice(0, 120),
      total, neto: importes.neto, iva: importes.iva, alicuota: importes.alicuota,
    };
  };

  const emitir = async (localId: string, cuerpo: { pago_id?: string; total?: number; receptor?: Receptor }) => {
    const config = await datos.config(localId);
    if (!config?.activo) return json({ error: 'La facturación no está activa para este local.' }, 400);
    const entorno = entornoDe(config.cuit);
    if (!localPermitido(entorno, localId)) return json({ error: sinPermiso }, 403);
    const total = Math.round(Number(cuerpo.total) * 100) / 100;
    if (!cuerpo.pago_id || !(total > 0) || !cuerpo.receptor) return json({ error: 'Faltan datos del cobro.' }, 400);
    const problema = problemaDelReceptor(cuerpo.receptor, config.condicion_emisor, total, Number(config.umbral_identificacion));
    if (problema) return json({ error: problema }, 400);

    const existente = await datos.buscarPorPago(localId, cuerpo.pago_id, 'factura');
    if (existente && existente.ambiente !== entornoDe(existente.emisor.cuit).ambiente) return json({ error: otroAmbiente }, 409);
    if (existente?.estado === 'autorizado') return json({ comprobante: existente });
    if (existente?.estado === 'descartado') return json({ error: 'Ese comprobante fue descartado.' }, 409);
    // Un pendiente pudo haber llegado a ARCA con estos datos: solo un rechazado admite corregirlos.
    if (existente?.estado === 'pendiente') return json({ comprobante: await procesar(existente) });
    if (existente) {
      const corregido = await datos.actualizar(existente.id, { ...camposDeFactura(config, cuerpo.receptor, total), ambiente: entorno.ambiente, estado: 'pendiente', numero: null, error: null });
      return json({ comprobante: await procesar(corregido) });
    }

    const nuevo = await datos.crear({
      ...camposDeFactura(config, cuerpo.receptor, total),
      local_id: localId, pago_id: cuerpo.pago_id, clase: 'factura', asociado_id: null, ambiente: entorno.ambiente,
      estado: 'pendiente', numero: null, fecha: null, cae: null, cae_vencimiento: null, qr_url: null, error: null,
    });
    return json({ comprobante: await procesar(nuevo) });
  };

  const notaCredito = async (factura: Comprobante) => {
    if (factura.clase !== 'factura' || factura.estado !== 'autorizado') {
      return json({ error: 'Solo se puede anular una factura autorizada.' }, 400);
    }
    const existente = await datos.buscarPorPago(factura.local_id, factura.pago_id, 'nota_credito');
    if (existente) return json({ comprobante: await procesar(existente) });
    const nota = await datos.crear({
      local_id: factura.local_id, pago_id: factura.pago_id, ambiente: factura.ambiente, emisor: factura.emisor,
      punto_venta: factura.punto_venta, concepto: factura.concepto, doc_tipo: factura.doc_tipo, doc_nro: factura.doc_nro,
      condicion_iva_receptor: factura.condicion_iva_receptor, receptor_nombre: factura.receptor_nombre,
      total: factura.total, neto: factura.neto, iva: factura.iva, alicuota: factura.alicuota,
      clase: 'nota_credito', asociado_id: factura.id, estado: 'pendiente',
      cbte_tipo: notaCreditoDe(factura.cbte_tipo),
      numero: null, fecha: null, cae: null, cae_vencimiento: null, qr_url: null, error: null,
    });
    return json({ comprobante: await procesar(nota) });
  };

  const ejecutar = async (accion: string, jwt: string, cuerpo: { id?: string }) => {
    const perfil = await datos.perfilDesdeSesion(jwt);
    if (!perfil?.activo || !perfil.local_id || !rolesQueFacturan.includes(perfil.rol)) {
      return json({ error: 'Tu usuario no puede facturar.' }, 403);
    }
    if (accion === 'emitir') return emitir(perfil.local_id, cuerpo);

    const comprobante = cuerpo.id ? await datos.buscarPorId(cuerpo.id) : null;
    if (!comprobante || comprobante.local_id !== perfil.local_id) return json({ error: 'No encontré ese comprobante.' }, 404);
    // Un comprobante de prueba reintentado o anulado en producción sería una operación fiscal real.
    if (accion !== 'descartar') {
      const entorno = entornoDe(comprobante.emisor.cuit);
      if (!localPermitido(entorno, perfil.local_id)) return json({ error: sinPermiso }, 403);
      if (comprobante.ambiente !== entorno.ambiente) return json({ error: otroAmbiente }, 409);
    }
    if (accion === 'nota-credito') return notaCredito(comprobante);
    if (accion === 'reintentar') {
      if (comprobante.estado === 'rechazado') {
        return json({ comprobante: await procesar(await datos.actualizar(comprobante.id, { estado: 'pendiente', numero: null, error: null })) });
      }
      return json({ comprobante: await procesar(comprobante) });
    }
    if (comprobante.estado !== 'rechazado') return json({ error: 'Solo se puede descartar un comprobante rechazado.' }, 400);
    return json({ comprobante: await datos.actualizar(comprobante.id, { estado: 'descartado' }) });
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const accion = new URL(req.url).pathname.replace(/^.*?\/arca(?=\/|$)/, '').replace(/^\//, '');
    if (req.method !== 'POST' || !['emitir', 'reintentar', 'nota-credito', 'descartar'].includes(accion)) return json({ error: 'Ruta desconocida.' }, 404);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Falta la sesión.' }, 401);
    try {
      return await ejecutar(accion, jwt, await req.json());
    } catch (error) {
      console.error(error);
      return json({ error: error instanceof Error ? error.message : 'Error interno.' }, 500);
    }
  };
};
