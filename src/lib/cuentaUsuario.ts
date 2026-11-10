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
