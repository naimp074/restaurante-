import { readStore } from './storeSync';

/** El nombre que sale arriba de los tickets: el de Configuración, o Aroma si no se cargó. */
export const nombreDelLocal = () =>
  readStore<{ nombre?: string }>('restaurant-config-local', {}).nombre?.trim() || 'Aroma';
