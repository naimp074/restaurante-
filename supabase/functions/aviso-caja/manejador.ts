/**
 * POST /
 * { fecha, cajero, esperado_efectivo, contado_efectivo, esperado_transferencia, contado_transferencia }
 *
 * Lo llama la caja al cerrar. El mail lo arma el servidor con la misma regla que
 * src/lib/avisoCierreCaja.ts: si falta más de $5.000 avisa eso, y si sobra plata
 * el texto solo dice que se cerró la caja.
 */
import { armarAvisoCierre, type ConteoCierre } from '../../../src/lib/avisoCierreCaja.ts';

export type PerfilAviso = { rol: string; activo: boolean; local_id: string | null };

export interface DatosAviso {
  perfilDesdeSesion(jwt: string): Promise<PerfilAviso | null>;
  destinatarios(localId: string): Promise<string[]>;
  enviar(correo: { para: string[]; asunto: string; texto: string }): Promise<void>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const rolesCierre = ['admin', 'encargado', 'cajero'];

const numero = (valor: unknown) => {
  const n = typeof valor === 'number' ? valor : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_000) return null;
  return Math.round(n * 100) / 100;
};

const leerConteo = (cuerpo: Record<string, unknown>): ConteoCierre | { error: string } => {
  const fecha = typeof cuerpo.fecha === 'string' ? cuerpo.fecha.trim() : '';
  // Sin números ni símbolos: el nombre no puede colar un importe en el mail de cierre.
  const cajero = (typeof cuerpo.cajero === 'string' ? cuerpo.cajero : '')
    .replace(/[^\p{L}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const esperadoEfectivo = numero(cuerpo.esperado_efectivo);
  const contadoEfectivo = numero(cuerpo.contado_efectivo);
  const esperadoTransferencia = numero(cuerpo.esperado_transferencia);
  const contadoTransferencia = numero(cuerpo.contado_transferencia);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha del cierre no es válida.' };
  if ([esperadoEfectivo, contadoEfectivo, esperadoTransferencia, contadoTransferencia].some(valor => valor === null)) {
    return { error: 'Los importes del cierre no son válidos.' };
  }
  return {
    fecha,
    cajero,
    esperadoEfectivo: esperadoEfectivo as number,
    contadoEfectivo: contadoEfectivo as number,
    esperadoTransferencia: esperadoTransferencia as number,
    contadoTransferencia: contadoTransferencia as number,
  };
};

export const crearManejadorAviso = (datos: DatosAviso) => async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Ruta desconocida.' }, 404);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Falta la sesión.' }, 401);

  try {
    const perfil = await datos.perfilDesdeSesion(jwt);
    if (!perfil?.activo || !perfil.local_id || !rolesCierre.includes(perfil.rol)) {
      return json({ error: 'No podés cerrar la caja.' }, 403);
    }

    const conteo = leerConteo(await req.json().catch(() => ({})));
    if ('error' in conteo) return json(conteo, 400);

    const aviso = armarAvisoCierre(conteo);
    if (!aviso) return json({ enviado: false });

    const para = await datos.destinatarios(perfil.local_id);
    if (!para.length) {
      return json({ error: 'No hay un Gmail de administrador para avisar. Cargalo en Configuración.' }, 500);
    }

    await datos.enviar({ para, asunto: aviso.asunto, texto: aviso.texto });
    return json({ enviado: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'No pude avisar por Gmail.';
    return json({ error: mensaje }, 500);
  }
};
