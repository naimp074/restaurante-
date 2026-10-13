/**
 * Id único entre dispositivos. Date.now() no alcanza: dos tablets que cargan algo en el
 * mismo milisegundo generaban el mismo id y un registro pisaba al otro al sincronizar.
 *
 * crypto.randomUUID solo existe en https o localhost; si el sistema se abre por la red
 * del local (http://192.168...) se arma igual con getRandomValues, que sí está.
 */
const uuid = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** El prefijo solo ayuda a reconocer el registro al leerlo (p. ej. 'pago-...'). */
export const nuevoId = (prefijo?: string) => (prefijo ? `${prefijo}-${uuid()}` : uuid());
