/**
 * Cuentas sin email: el admin le crea al mozo un usuario ("juan") y con eso entra.
 * Supabase igual necesita un email, así que se arma uno interno que nadie tiene que conocer
 * ni recibe correo. La misma regla está en supabase/functions/usuarios/manejador.ts:
 * si se cambia el dominio acá, hay que cambiarlo allá (lo controla tests/usuarios.test.mjs).
 */
export const dominioCuentas = 'usuarios.burgerpos.local';

/** "Juan Pérez" → "juan.perez". */
export const normalizarUsuario = (texto: string) =>
  texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.');

/** 3 a 30 letras, números, puntos, guiones o guiones bajos; empieza con letra o número. */
export const usuarioValido = (usuario: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario);

/** Lo que se escribe en el login: un email tal cual, o un usuario que se pasa al email interno. */
export const emailParaEntrar = (texto: string) =>
  texto.includes('@') ? texto.trim().toLowerCase() : `${normalizarUsuario(texto)}@${dominioCuentas}`;

/** Para mostrar: el usuario si la cuenta es sin email, si no el email. */
export const accesoDeCuenta = (email: string) =>
  email.endsWith(`@${dominioCuentas}`) ? email.slice(0, -(dominioCuentas.length + 1)) : email;

export const esCuentaSinEmail = (email: string) => email.endsWith(`@${dominioCuentas}`);

export interface EstadoCuenta {
  activo: boolean;
  local_id: string | null;
  rol: string;
  paginas?: string[] | null;
  ultimo_ingreso?: string | null;
  email_confirmado?: boolean | null;
  bloqueada_hasta?: string | null;
}

/** Lo que le impide entrar a una cuenta, para que el admin lo vea sin adivinar. Vacío: puede entrar. */
export const problemasDeCuenta = (cuenta: EstadoCuenta, ahora = new Date()): string[] => {
  const problemas: string[] = [];
  if (!cuenta.local_id) problemas.push('Está esperando que la apruebes.');
  else if (!cuenta.activo) problemas.push('Está bloqueada: tocá "Bloqueada" para activarla.');
  if (cuenta.email_confirmado === false) problemas.push('Le falta confirmar el email: poniéndole una contraseña nueva queda confirmada.');
  if (cuenta.bloqueada_hasta && new Date(cuenta.bloqueada_hasta).getTime() > ahora.getTime()) {
    problemas.push(`Supabase la bloqueó hasta el ${new Date(cuenta.bloqueada_hasta).toLocaleString('es-AR')}.`);
  }
  if (cuenta.rol !== 'admin' && Array.isArray(cuenta.paginas) && cuenta.paginas.length === 0) {
    problemas.push('No tiene ninguna pantalla para mirar: elegí al menos una en "Qué puede mirar".');
  }
  return problemas;
};

/** "Entró hace 3 días", "Nunca entró". */
export const textoUltimoIngreso = (ultimo?: string | null, ahora = new Date()) => {
  if (!ultimo) return 'Nunca entró';
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(ultimo).getTime()) / 60000));
  if (minutos < 1) return 'Entró recién';
  if (minutos < 60) return `Entró hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Entró hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'Entró ayer' : `Entró hace ${dias} días`;
};

/** Una contraseña fácil de dictar, sin 0 ni 1 (se confunden con o y l). Ej: "mesa-4827-sol". */
export const generarClave = (azar: () => number = Math.random) => {
  const palabras = ['mesa', 'sol', 'cafe', 'pan', 'luna', 'mate', 'flor', 'rio', 'tango', 'nube', 'vino', 'pera', 'menta', 'aroma', 'limon', 'bosque'];
  const elegir = () => palabras[Math.floor(azar() * palabras.length) % palabras.length];
  const numero = String(Math.floor(azar() * 9000) + 1000).replace(/[01]/g, d => (d === '0' ? '8' : '7'));
  return `${elegir()}-${numero}-${elegir()}`;
};
