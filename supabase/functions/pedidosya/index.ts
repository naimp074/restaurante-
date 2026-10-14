// Función de Supabase (Deno) que conecta PedidosYa con BurgerPOS.
// Despliegue y configuración: ver supabase/functions/pedidosya/LEEME.md
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { crearManejador, type Datos, type FilaPedidoPlataforma } from './manejador.ts';
import type { PedidoMapeado, ProductoCatalogo } from './mapeo.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const clavePedidos = 'restaurant-demo-pedidos';
const claveProductos = 'restaurant-productos';

const fallo = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const datos: Datos = {
  async localPorRemoteId(remoteId) {
    const { data, error } = await supabase.from('pedidosya_locales').select('local_id, activo').eq('remote_id', remoteId).maybeSingle();
    fallo(error);
    return data;
  },
  async pedidoPlataformaPorToken(token) {
    const { data, error } = await supabase.from('pedidosya_pedidos').select('*').eq('token', token).maybeSingle();
    fallo(error);
    return data as FilaPedidoPlataforma | null;
  },
  async pedidoPlataformaPorId(pedidoId) {
    const { data, error } = await supabase.from('pedidosya_pedidos').select('*').eq('pedido_id', pedidoId).maybeSingle();
    fallo(error);
    return data as FilaPedidoPlataforma | null;
  },
  async guardarPedidoPlataforma(fila) {
    const { error } = await supabase.from('pedidosya_pedidos').upsert(fila, { onConflict: 'token' });
    fallo(error);
  },
  async actualizarEstadoPlataforma(token, estado) {
    const { error } = await supabase.from('pedidosya_pedidos').update({ ultimo_estado: estado, updated_at: new Date().toISOString() }).eq('token', token);
    fallo(error);
  },
  async catalogo(localId) {
    const { data, error } = await supabase
      .from('sync_registros')
      .select('payload')
      .eq('local_id', localId)
      .eq('clave', claveProductos)
      .eq('eliminado', false);
    fallo(error);
    return (data || []).map(fila => fila.payload as ProductoCatalogo).filter(p => p && p.id);
  },
  async leerPedido(localId, pedidoId) {
    const { data, error } = await supabase
      .from('sync_registros')
      .select('payload, eliminado')
      .eq('local_id', localId)
      .eq('clave', clavePedidos)
      .eq('registro_id', `#${pedidoId}`)
      .maybeSingle();
    fallo(error);
    return data && !data.eliminado ? data.payload as PedidoMapeado : null;
  },
  async escribirPedido(localId, pedido) {
    const { error } = await supabase.from('sync_registros').upsert({
      local_id: localId,
      clave: clavePedidos,
      registro_id: `#${pedido.id}`,
      payload: pedido,
      eliminado: false,
    }, { onConflict: 'local_id,clave,registro_id' });
    fallo(error);
  },
  async perfilDesdeSesion(jwt) {
    const { data } = await supabase.auth.getUser(jwt);
    if (!data.user) return null;
    const { data: perfil } = await supabase.from('profiles').select('rol, local_id, activo').eq('id', data.user.id).maybeSingle();
    return perfil;
  },
};

Deno.serve(crearManejador(datos, {
  secreto: Deno.env.get('PEDIDOSYA_SECRETO') || '',
  usuario: Deno.env.get('PEDIDOSYA_USUARIO') || '',
  clave: Deno.env.get('PEDIDOSYA_CLAVE') || '',
  api: Deno.env.get('PEDIDOSYA_API') || 'https://integration-middleware.stg.restaurant-partners.com',
}));
