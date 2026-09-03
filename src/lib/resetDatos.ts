const versionStorageKey = 'restaurant-datos-version';

/**
 * Se incrementa cuando hay que descartar los datos guardados en el navegador.
 * La versión 2 borra los datos de demostración con los que venía el sistema.
 */
const versionActual = '2';

const esClaveDelSistema = (clave: string) =>
  clave.startsWith('restaurant-') || clave === 'demo_user';

export const limpiarDatosLocales = () => {
  if (typeof window === 'undefined') return;

  const claves = Object.keys(window.localStorage).filter(esClaveDelSistema);
  claves.forEach(clave => window.localStorage.removeItem(clave));
  window.localStorage.setItem(versionStorageKey, versionActual);
};

/** Descarta los datos viejos del navegador cuando cambia la versión de datos. */
export const migrarDatosLocales = () => {
  if (typeof window === 'undefined') return;

  const version = window.localStorage.getItem(versionStorageKey);
  if (version === versionActual) return;

  limpiarDatosLocales();
};
