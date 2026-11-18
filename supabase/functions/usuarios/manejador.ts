/**
 * POST /clave { id, password }
 * El admin le pone una contraseña nueva a una cuenta de su local (se la olvidó o no puede entrar).
 * La contraseña anterior no se puede ver: Supabase guarda solo un resumen cifrado.
 *
 * POST /crear { usuario | email, password, nombre, apellido, rol, paginas }
 * Crea la cuenta ya activa en el local del admin que la pide. Va en el servidor porque
 * crear usuarios sin cerrar la sesión del admin requiere la service role.
 *
 * El email no es obligatorio: con un usuario ("juan") se arma un email interno para Supabase
 * y el mozo entra escribiendo solo "juan". Misma regla que src/lib/cuentaUsuario.ts.
 */
export const dominioCuentas = 'usuarios.burgerpos.local';
const normalizarUsuario = (texto: string) =>
  texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.');

export type Perfil = { rol: string; activo: boolean; local_id: string | null };

export type DatosCuenta = {
  email: string; password: string; nombre: string; apellido: string; rol: string; paginas: string[] | null;
};

export interface Datos {
  perfilDesdeSesion(jwt: string): Promise<Perfil | null>;
  crearUsuario(cuenta: DatosCuenta): Promise<{ id: string } | { error: string }>;
  activarPerfil(id: string, localId: string, cuenta: DatosCuenta): Promise<void>;
  borrarUsuario(id: string): Promise<void>;
  /** El local de la cuenta, para no tocar cuentas de otro local. Null si no existe. */
  localDeCuenta(id: string): Promise<{ local_id: string | null } | null>;
  cambiarClave(id: string, password: string): Promise<{ error?: string }>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const roles = ['admin', 'encargado', 'cajero', 'moza', 'cocina'];

const leerCuenta = (cuerpo: Record<string, unknown>): DatosCuenta | { error: string } => {
  const texto = (campo: string) => (typeof cuerpo[campo] === 'string' ? (cuerpo[campo] as string).trim() : '');
  const usuario = normalizarUsuario(texto('usuario'));
  const email = usuario && !usuario.includes('@') ? `${usuario}@${dominioCuentas}` : (texto('email') || usuario).toLowerCase();
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
  const rol = texto('rol');
  if (!texto('usuario') && !texto('email')) return { error: 'Falta el usuario para entrar.' };
  if (usuario && !usuario.includes('@') && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario)) {
    return { error: 'El usuario tiene que tener de 3 a 30 letras o números (puede llevar punto, guion o guion bajo).' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El email no es válido.' };
  if (password.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' };
  if (!texto('nombre')) return { error: 'Falta el nombre.' };
  if (!roles.includes(rol)) return { error: 'El rol no es válido.' };

  // El admin siempre ve todo. Para el resto, sin una lista de pantallas la cuenta no podría entrar.
  const paginas = cuerpo.paginas;
  if (rol === 'admin') return { email, password, nombre: texto('nombre'), apellido: texto('apellido'), rol, paginas: null };
  if (!Array.isArray(paginas) || !paginas.length || !paginas.every(p => typeof p === 'string')) {
    return { error: 'Elegí al menos una pantalla.' };
  }
  if (paginas.includes('usuarios')) return { error: 'La pantalla de usuarios es solo para administradores.' };
  return { email, password, nombre: texto('nombre'), apellido: texto('apellido'), rol, paginas: paginas as string[] };
};

export const crearManejador = (datos: Datos) => async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const accion = new URL(req.url).pathname.replace(/^.*?\/usuarios(?=\/|$)/, '').replace(/^\//, '');
  if (req.method !== 'POST' || (accion !== 'crear' && accion !== 'clave')) return json({ error: 'Ruta desconocida.' }, 404);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Falta la sesión.' }, 401);

  try {
    const perfil = await datos.perfilDesdeSesion(jwt);
    if (!perfil?.activo || perfil.rol !== 'admin' || !perfil.local_id) {
      return json({ error: accion === 'clave' ? 'Solo un administrador puede cambiar contraseñas.' : 'Solo un administrador puede crear usuarios.' }, 403);
    }

    if (accion === 'clave') {
      const cuerpo = await req.json() as Record<string, unknown>;
      const id = typeof cuerpo.id === 'string' ? cuerpo.id : '';
      const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
      if (!id) return json({ error: 'Falta la cuenta.' }, 400);
      if (password.length < 8) return json({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }, 400);
      const destino = await datos.localDeCuenta(id);
      // Una cuenta pendiente (sin local) también: el admin la está por aprobar.
      if (!destino || (destino.local_id && destino.local_id !== perfil.local_id)) {
        return json({ error: 'Esa cuenta no es de tu local.' }, 404);
      }
      const resultado = await datos.cambiarClave(id, password);
      if (resultado.error) return json({ error: resultado.error }, 400);
      return json({ ok: true });
    }

    const cuenta = leerCuenta(await req.json());
    if ('error' in cuenta) return json(cuenta, 400);

    const creado = await datos.crearUsuario(cuenta);
    if ('error' in creado) return json(creado, 409);

    try {
      await datos.activarPerfil(creado.id, perfil.local_id, cuenta);
    } catch (error) {
      // Sin perfil activo la cuenta queda inservible y el email, ocupado.
      await datos.borrarUsuario(creado.id);
      throw error;
    }
    return json({ id: creado.id });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Error interno.' }, 500);
  }
};
