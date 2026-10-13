import type { Rol } from '../types';

/**
 * Qué datos puede modificar cada rol. Es un espejo de puede_escribir_registro() en
 * Supabase: el servidor es quien manda, esto evita mandar cambios que va a rechazar.
 */
const clavesCajero = new Set([
  'restaurant-mesas',
  'restaurant-demo-pedidos',
  'restaurant-demo-ingredientes',
  'restaurant-demo-producciones',
  'restaurant-demo-movimientos-stock',
  'restaurant-cajas-diarias',
  'restaurant-apartados-caja',
  'restaurant-pagos',
  'restaurant-cuentas-dinero',
  'restaurant-movimientos-financieros',
  'restaurant-cuenta-corriente',
]);

const clavesSalon = new Set(['restaurant-mesas', 'restaurant-demo-pedidos']);

export const puedeEscribirRegistro = (rol: Rol | undefined, userId: string | undefined, clave: string, registroId: string) => {
  if (!rol) return false;
  if (rol === 'admin' || rol === 'encargado') return true;
  if (clave === 'restaurant-usuarios') return Boolean(userId) && registroId === `#${userId}`;
  if (rol === 'cajero') return clavesCajero.has(clave);
  return clavesSalon.has(clave);
};

/** Si el rol puede escribir al menos algún registro de la clave. */
export const puedeEscribirClave = (rol: Rol | undefined, clave: string) => {
  if (!rol) return false;
  if (rol === 'admin' || rol === 'encargado' || clave === 'restaurant-usuarios') return true;
  if (rol === 'cajero') return clavesCajero.has(clave);
  return clavesSalon.has(clave);
};
