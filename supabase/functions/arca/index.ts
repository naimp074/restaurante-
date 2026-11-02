// Función de Supabase (Deno) que factura con ARCA.
// Despliegue y configuración: ver supabase/functions/arca/LEEME.md
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { crearClienteArca, type Ambiente } from './cliente.ts';
import { firmarConCertificado } from './firma.ts';
import { crearManejador, type Comprobante, type ConfigFiscal, type Datos } from './manejador.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const ambiente: Ambiente = Deno.env.get('ARCA_AMBIENTE') === 'produccion' ? 'produccion' : 'homologacion';

const fallo = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const datos: Datos = {
  async perfilDesdeSesion(jwt) {
    const { data } = await supabase.auth.getUser(jwt);
    if (!data.user) return null;
    const { data: perfil } = await supabase.from('profiles').select('rol, local_id, activo').eq('id', data.user.id).maybeSingle();
    return perfil;
  },
  async config(localId) {
    const { data, error } = await supabase.from('arca_config').select('*').eq('local_id', localId).maybeSingle();
    fallo(error);
    return data as ConfigFiscal | null;
  },
  async buscarPorPago(localId, pagoId, clase) {
    const { data, error } = await supabase.from('comprobantes_fiscales').select('*')
      .eq('local_id', localId).eq('pago_id', pagoId).eq('clase', clase).maybeSingle();
    fallo(error);
    return data as Comprobante | null;
  },
  async buscarPorId(id) {
    const { data, error } = await supabase.from('comprobantes_fiscales').select('*').eq('id', id).maybeSingle();
    fallo(error);
    return data as Comprobante | null;
  },
  async autorizadoConNumero(c, numero) {
    const { data, error } = await supabase.from('comprobantes_fiscales').select('*')
      .eq('ambiente', c.ambiente).eq('emisor->>cuit', c.emisor.cuit).eq('punto_venta', c.punto_venta)
      .eq('cbte_tipo', c.cbte_tipo).eq('numero', numero).eq('estado', 'autorizado').neq('id', c.id).maybeSingle();
    fallo(error);
    return data as Comprobante | null;
  },
  async crear(c) {
    const { data, error } = await supabase.from('comprobantes_fiscales')
      .upsert(c, { onConflict: 'local_id,pago_id,clase', ignoreDuplicates: true }).select('*').maybeSingle();
    fallo(error);
    if (data) return data as Comprobante;
    const existente = await datos.buscarPorPago(c.local_id, c.pago_id, c.clase);
    if (!existente) throw new Error('No se pudo guardar el comprobante.');
    return existente;
  },
  async actualizar(id, cambios) {
    const { data, error } = await supabase.from('comprobantes_fiscales')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    fallo(error);
    return data as Comprobante;
  },
  async tomarTurno(clave, segundos) {
    const { data, error } = await supabase.rpc('arca_tomar_turno', { p_clave: clave, p_segundos: segundos });
    fallo(error);
    return data === true;
  },
  async soltarTurno(clave) {
    const { error } = await supabase.from('arca_turnos').delete().eq('clave', clave);
    fallo(error);
  },
};

const arca = crearClienteArca({
  ambiente,
  firmar: texto => firmarConCertificado(Deno.env.get('ARCA_CERTIFICADO') || '', Deno.env.get('ARCA_CLAVE_PRIVADA') || '')(texto),
  tokens: {
    async leer(amb) {
      const { data, error } = await supabase.from('arca_tokens').select('token, firma, vence').eq('ambiente', amb).maybeSingle();
      fallo(error);
      return data;
    },
    async guardar(amb, acceso) {
      const { error } = await supabase.from('arca_tokens').upsert({ ambiente: amb, ...acceso });
      fallo(error);
    },
  },
});

Deno.serve(crearManejador(datos, arca, ambiente));
