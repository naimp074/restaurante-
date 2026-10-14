import { verificarJwtMiddleware } from './jwt.ts';
import {
  horaDeAceptacion,
  idPedidoDesdeToken,
  mapearPedido,
  motivosRechazo,
  validarOrden,
  type OrdenPedidosYa,
  type PedidoMapeado,
  type ProductoCatalogo,
} from './mapeo.ts';

/**
 * "Plugin" de BurgerPOS para la integración directa con PedidosYa (Delivery Hero).
 *
 * Rutas que llama PedidosYa (firmadas con JWT, ver jwt.ts):
 *   POST /order/{remoteId}                                         pedido nuevo
 *   PUT  /remoteId/{remoteId}/remoteOrder/{remoteOrderId}/posOrderStatus   cancelación, retiro, etc.
 *   PUT  /remoteId/{remoteId}/availability                          local abierto / cerrado
 *
 * Ruta que llama el sistema (con la sesión del usuario):
 *   POST /accion   { pedido_id, accion: 'aceptar' | 'rechazar' | 'listo' | 'retirado', minutos?, motivo? }
 */

export type FilaPedidoPlataforma = {
  token: string;
  local_id: string;
  remote_id: string;
  pedido_id: string;
  payload: OrdenPedidosYa;
  ultimo_estado?: string | null;
};

export type Perfil = { rol: string; local_id: string | null; activo: boolean };

/** Acceso a datos: en producción lo implementa index.ts con Supabase; en las pruebas, memoria. */
export interface Datos {
  localPorRemoteId(remoteId: string): Promise<{ local_id: string; activo: boolean } | null>;
  pedidoPlataformaPorToken(token: string): Promise<FilaPedidoPlataforma | null>;
  pedidoPlataformaPorId(pedidoId: string): Promise<FilaPedidoPlataforma | null>;
  guardarPedidoPlataforma(fila: FilaPedidoPlataforma): Promise<void>;
  actualizarEstadoPlataforma(token: string, estado: string): Promise<void>;
  catalogo(localId: string): Promise<ProductoCatalogo[]>;
  leerPedido(localId: string, pedidoId: string): Promise<PedidoMapeado | null>;
  /** Escribe el pedido en sync_registros: así llega en vivo a todas las pantallas del local. */
  escribirPedido(localId: string, pedido: PedidoMapeado): Promise<void>;
  perfilDesdeSesion(jwt: string): Promise<Perfil | null>;
}

export type Config = {
  /** Secreto para verificar el JWT de PedidosYa. */
  secreto: string;
  /** Usuario y clave de la integración (Login API). */
  usuario: string;
  clave: string;
  /** Base de la API de PedidosYa, p. ej. https://integration-middleware.stg.restaurant-partners.com */
  api: string;
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

const rolesQueOperan = ['admin', 'encargado', 'cajero'];

export const crearManejador = (datos: Datos, config: Config, fetchApi: typeof fetch = fetch) => {
  let tokenApi: { valor: string; vence: number } | null = null;

  const loginApi = async () => {
    if (tokenApi && tokenApi.vence > Date.now() + 60_000) return tokenApi.valor;
    const respuesta = await fetchApi(`${config.api.replace(/\/$/, '')}/v2/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: config.usuario, password: config.clave, grant_type: 'client_credentials' }),
    });
    if (!respuesta.ok) throw new Error(`PedidosYa rechazó el inicio de sesión (${respuesta.status}). Revisá usuario y clave de la integración.`);
    const cuerpo = await respuesta.json() as { access_token: string; expires_in: number };
    tokenApi = { valor: cuerpo.access_token, vence: Date.now() + (cuerpo.expires_in || 1800) * 1000 };
    return tokenApi.valor;
  };

  const llamarCallback = async (url: string, cuerpo?: unknown) => {
    const token = await loginApi();
    const respuesta = await fetchApi(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    return { ok: respuesta.ok, status: respuesta.status, texto };
  };

  // ---------- PedidosYa -> BurgerPOS ----------

  const recibirPedido = async (remoteId: string, cuerpo: unknown) => {
    if (!validarOrden(cuerpo)) {
      return json({ reason: 'TECHNICAL_PROBLEM', message: 'Pedido incompleto: falta token, código o productos.' }, 400);
    }
    const local = await datos.localPorRemoteId(remoteId);
    if (!local || !local.activo) {
      return json({ reason: 'MENU_ACCOUNT_SETTINGS', message: `remoteId desconocido o desactivado: ${remoteId}` }, 400);
    }

    const pedidoId = idPedidoDesdeToken(cuerpo.token);
    const existente = await datos.pedidoPlataformaPorToken(cuerpo.token);
    // Si PedidosYa reintenta (timeout), se responde igual sin duplicar el pedido.
    if (existente && await datos.leerPedido(existente.local_id, existente.pedido_id)) {
      return json({ remoteResponse: { remoteOrderId: existente.pedido_id } });
    }

    const pedido = mapearPedido(cuerpo, await datos.catalogo(local.local_id));
    await datos.guardarPedidoPlataforma({
      token: cuerpo.token,
      local_id: local.local_id,
      remote_id: remoteId,
      pedido_id: pedidoId,
      payload: cuerpo,
      ultimo_estado: pedido.externo.estado_plataforma,
    });
    await datos.escribirPedido(local.local_id, pedido);
    return json({ remoteResponse: { remoteOrderId: pedidoId } });
  };

  const recibirEstado = async (remoteOrderId: string, cuerpo: { status?: string; message?: string; updatedOrder?: OrdenPedidosYa }) => {
    const fila = await datos.pedidoPlataformaPorId(remoteOrderId);
    if (!fila) return json({ code: 'NOT_FOUND' }, 404);
    const pedido = await datos.leerPedido(fila.local_id, fila.pedido_id);
    const estado = cuerpo.status || '';
    await datos.actualizarEstadoPlataforma(fila.token, estado);
    if (!pedido) return json({ message: 'OK' });

    const ahora = new Date().toISOString();
    if (estado === 'ORDER_CANCELLED') {
      await datos.escribirPedido(fila.local_id, {
        ...pedido,
        estado: 'cancelado',
        observaciones: [pedido.observaciones, `Cancelado por PedidosYa${cuerpo.message ? `: ${cuerpo.message}` : ''}`].filter(Boolean).join(' · '),
        updated_at: ahora,
        externo: { ...pedido.externo, estado_plataforma: 'cancelado' },
      });
    } else if (estado === 'ORDER_PICKED_UP') {
      await datos.escribirPedido(fila.local_id, { ...pedido, updated_at: ahora, externo: { ...pedido.externo, estado_plataforma: 'retirado' } });
    } else if (estado === 'PRODUCT_ORDER_MODIFICATION_SUCCESSFUL' && cuerpo.updatedOrder && validarOrden(cuerpo.updatedOrder)) {
      const modificado = mapearPedido(cuerpo.updatedOrder, await datos.catalogo(fila.local_id), ahora);
      await datos.escribirPedido(fila.local_id, {
        ...modificado,
        estado: pedido.estado,
        externo: { ...modificado.externo, estado_plataforma: pedido.externo.estado_plataforma },
      });
    }
    return json({ message: 'OK' });
  };

  // ---------- BurgerPOS -> PedidosYa ----------

  const ejecutarAccion = async (jwtUsuario: string, cuerpo: { pedido_id?: string; accion?: string; minutos?: number; motivo?: string; mensaje?: string }) => {
    const perfil = await datos.perfilDesdeSesion(jwtUsuario);
    if (!perfil?.activo || !perfil.local_id || !rolesQueOperan.includes(perfil.rol)) {
      return json({ error: 'Tu usuario no puede operar pedidos de PedidosYa.' }, 403);
    }
    const fila = cuerpo.pedido_id ? await datos.pedidoPlataformaPorId(cuerpo.pedido_id) : null;
    if (!fila || fila.local_id !== perfil.local_id) return json({ error: 'No encontré ese pedido de PedidosYa.' }, 404);

    const urls = fila.payload.callbackUrls || {};
    let url: string | null | undefined;
    let envio: unknown;
    let estadoNuevo = '';

    switch (cuerpo.accion) {
      case 'aceptar':
        url = urls.orderAcceptedUrl;
        envio = {
          status: 'order_accepted',
          acceptanceTime: horaDeAceptacion(fila.payload, Number(cuerpo.minutos) || 0),
          remoteOrderId: fila.pedido_id,
        };
        estadoNuevo = 'aceptado';
        break;
      case 'rechazar': {
        const motivo = motivosRechazo.find(m => m === cuerpo.motivo) || 'TOO_BUSY';
        url = urls.orderRejectedUrl;
        envio = { status: 'order_rejected', reason: motivo, message: cuerpo.mensaje || motivo };
        estadoNuevo = 'rechazado';
        break;
      }
      case 'listo':
        url = urls.orderPreparedUrl;
        estadoNuevo = 'listo';
        break;
      case 'retirado':
        url = urls.orderPickedUpUrl;
        envio = { status: 'order_picked_up' };
        estadoNuevo = 'retirado';
        break;
      default:
        return json({ error: 'Acción desconocida.' }, 400);
    }

    // Sin URL, PedidosYa no espera ese aviso para este pedido (lo indica su documentación).
    if (!url) return json({ ok: true, estado: estadoNuevo, aviso: 'PedidosYa no requiere este aviso para este pedido.' });

    try {
      const resultado = await llamarCallback(url, envio);
      if (!resultado.ok) {
        const reintentar = resultado.status === 409 && /ASSIGNED_TO_TRANSPORT|WAITING_FOR_ACKNOWLEDGEMENT/.test(resultado.texto);
        return json({
          error: reintentar
            ? 'PedidosYa todavía está procesando el pedido. Probá de nuevo en unos segundos.'
            : `PedidosYa respondió ${resultado.status}: ${resultado.texto.slice(0, 300)}`,
          reintentar,
        }, 502);
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'No pude comunicarme con PedidosYa.' }, 502);
    }

    await datos.actualizarEstadoPlataforma(fila.token, estadoNuevo);
    return json({ ok: true, estado: estadoNuevo });
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    // La URL llega como /pedidosya/... (o /functions/v1/pedidosya/...): se toma lo que sigue.
    const ruta = new URL(req.url).pathname.replace(/^.*?\/pedidosya(?=\/|$)/, '') || '/';
    const partes = ruta.split('/').filter(Boolean).map(decodeURIComponent);

    try {
      if (req.method === 'POST' && partes[0] === 'accion' && partes.length === 1) {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!jwt) return json({ error: 'Falta la sesión.' }, 401);
        return await ejecutarAccion(jwt, await req.json());
      }

      if (!await verificarJwtMiddleware(req.headers.get('Authorization'), config.secreto)) {
        return json({ code: 'UNAUTHORIZED' }, 401);
      }

      if (req.method === 'POST' && partes[0] === 'order' && partes.length === 2) {
        return await recibirPedido(partes[1], await req.json());
      }
      if (req.method === 'PUT' && partes[0] === 'remoteId' && partes[2] === 'remoteOrder' && partes[4] === 'posOrderStatus') {
        return await recibirEstado(partes[3], await req.json());
      }
      if (req.method === 'PUT' && partes[0] === 'remoteId' && partes[2] === 'availability') {
        return json({ message: 'OK' });
      }
      return json({ code: 'NOT_FOUND' }, 404);
    } catch (error) {
      // 500 hace que PedidosYa reintente el envío más tarde.
      console.error(error);
      return json({ code: 'INTERNAL_SERVICE_ERROR', message: error instanceof Error ? error.message : '' }, 500);
    }
  };
};
