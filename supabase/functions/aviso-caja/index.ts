// Avisa por Gmail al cerrar la caja.
// Secretos: GMAIL_USUARIO (la cuenta que envía) y GMAIL_CLAVE_APP (clave de aplicación de Google, no la contraseña).
// Despliegue: npx supabase functions deploy aviso-caja --use-api --project-ref mcjnthwcfyqbrgwdjwir
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { destinatariosAviso } from '../../../src/lib/avisoCierreCaja.ts';
import { crearManejadorAviso } from './manejador.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const correosDeAdmins = async (localId: string) => {
  const { data: perfiles, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('rol', 'admin')
    .eq('activo', true)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
  const ids = new Set((perfiles || []).map(perfil => perfil.id as string));
  const correos: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error: fallo } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (fallo) throw new Error(fallo.message);
    data.users.forEach(usuario => {
      if (ids.has(usuario.id) && usuario.email) correos.push(usuario.email);
    });
    if (data.users.length < 200) break;
  }
  return correos;
};

const gmailConfigurado = async (localId: string) => {
  const { data, error } = await supabase
    .from('sync_registros')
    .select('payload')
    .eq('local_id', localId)
    .eq('clave', 'restaurant-config-local')
    .eq('registro_id', '.gmail_admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.payload === 'string' ? data.payload : '';
};

const enviarPorGmail = async ({ para, asunto, texto }: { para: string[]; asunto: string; texto: string }) => {
  const usuario = Deno.env.get('GMAIL_USUARIO');
  const clave = Deno.env.get('GMAIL_CLAVE_APP');
  if (!usuario || !clave) throw new Error('Falta configurar el Gmail que envía los avisos.');
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: usuario, password: clave },
    },
  });
  try {
    for (const destino of para) {
      await client.send({ from: usuario, to: destino, subject: asunto, content: texto });
    }
  } finally {
    await client.close();
  }
};

Deno.serve(crearManejadorAviso({
  async perfilDesdeSesion(jwt) {
    const { data } = await supabase.auth.getUser(jwt);
    if (!data.user) return null;
    const { data: perfil } = await supabase.from('profiles').select('rol, local_id, activo').eq('id', data.user.id).maybeSingle();
    return perfil;
  },
  async destinatarios(localId) {
    const [admins, gmail] = await Promise.all([correosDeAdmins(localId), gmailConfigurado(localId)]);
    return destinatariosAviso([...admins, gmail]);
  },
  enviar: enviarPorGmail,
}));
