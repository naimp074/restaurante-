import { documentoPorClave } from './sync/documentos';
import { readStore, withStoreTransaction, writeStore } from './storeSync';

/** El historial que se borra. Carta, categorías, usuarios, listas de precios y configuración quedan. */
const clavesAVaciar = [
  'restaurant-demo-pedidos',
  'restaurant-demo-ingredientes',
  'restaurant-demo-producciones',
  'restaurant-demo-movimientos-stock',
  'restaurant-demo-registros-produccion',
  'restaurant-cajas-diarias',
  'restaurant-apartados-caja',
  'restaurant-pagos',
  'restaurant-gastos',
  'restaurant-movimientos-financieros',
  'restaurant-cuenta-corriente',
  'restaurant-proveedores',
  'restaurant-facturas-proveedor',
  'restaurant-pagos-proveedor',
];

const clavesAReiniciar = ['restaurant-mesas', 'restaurant-cuentas-dinero'];

/** Vacía las listas y conserva la forma: cuenta corriente es un objeto con listas adentro. */
export const vaciar = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return [];
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([campo, contenido]) => [campo, Array.isArray(contenido) ? [] : contenido]));
  }
  return [];
};

/** Las mesas quedan armadas pero libres, y las cuentas de dinero, con saldo cero. */
export const reiniciarMesas = <T extends object>(mesas: T[]) => mesas.map(mesa => ({ ...mesa, estado: 'libre' }));
export const reiniciarCuentas = <T extends object>(cuentas: T[]) => cuentas.map(cuenta => ({ ...cuenta, saldo: 0 }));

/** Todo lo que se va a tocar, tal como está, para poder recuperarlo. */
export const copiaAntesDeEmpezar = () =>
  Object.fromEntries([...clavesAVaciar, ...clavesAReiniciar].map(clave => [clave, readStore<unknown>(clave, null)]));

export const empezarDeCero = () => {
  withStoreTransaction(() => {
    const guardar = (clave: string, valor: unknown) => writeStore(clave, valor, documentoPorClave(clave)?.evento || `${clave}-updated`);
    clavesAVaciar.forEach(clave => guardar(clave, vaciar(readStore<unknown>(clave, []))));
    guardar('restaurant-mesas', reiniciarMesas(readStore<object[]>('restaurant-mesas', [])));
    guardar('restaurant-cuentas-dinero', reiniciarCuentas(readStore<object[]>('restaurant-cuentas-dinero', [])));
  });
};
