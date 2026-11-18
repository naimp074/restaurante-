// Función de Supabase (Deno) para que un admin cree cuentas con usuario (o email) y contraseña,
// y les ponga una contraseña nueva si se la olvidan.
// Despliegue: npx supabase functions deploy usuarios --no-verify-jwt --use-api --project-ref mcjnthwcfyqbrgwdjwir
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { crearManejador, dominioCuentas } from './manejador.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(crearManejador({
  async perfilDesdeSesion(jwt) {
    const { data } = await supabase.auth.getUser(jwt);
    if (!data.user) return null;
    const { data: perfil } = await supabase.from('profiles').select('rol, local_id, activo').eq('id', data.user.id).maybeSingle();
    return perfil;
  },
  async crearUsuario({ email, password, nombre, apellido }) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido },
    });
    if (error || !data.user) {
      const repetido = /already|registered|exists/i.test(error?.message || '');
      const sinEmail = email.endsWith(`@${dominioCuentas}`);
      const yaExiste = sinEmail ? 'Ese usuario ya está en uso. Probá con otro (ej: juan.aroma).' : 'Ya existe una cuenta con ese email.';
      return { error: repetido ? yaExiste : error?.message || 'No se pudo crear la cuenta.' };
    }
    return { id: data.user.id };
  },
  async activarPerfil(id, localId, { nombre, apellido, rol, paginas }) {
    // El trigger de auth.users ya creó el perfil, inactivo y sin local.
    const { error } = await supabase.from('profiles')
      .update({ nombre, apellido, rol, paginas, activo: true, local_id: localId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
  async borrarUsuario(id) {
    await supabase.auth.admin.deleteUser(id);
  },
  async localDeCuenta(id) {
    const { data } = await supabase.from('profiles').select('local_id').eq('id', id).maybeSingle();
    return data;
  },
  async cambiarClave(id, password) {
    // Confirma el email de paso: si a la cuenta le faltaba eso, tampoco podía entrar.
    const { error } = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (!error) return {};
    if (/weak|pwned|leaked/i.test(error.message)) return { error: 'Esa contraseña es muy fácil o ya apareció filtrada en internet. Probá con otra.' };
    return { error: error.message };
  },
}));
