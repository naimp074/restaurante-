/**
 * Freno de seguridad: un equipo no puede borrar de golpe muchos registros del servidor. Eso pasaba
 * con un equipo que se quedó sin lugar o con una copia vieja: "borraba" lo que no tenía. Solo se
 * permite cuando alguien lo pidió a propósito (Empezar de cero).
 */
const autorizados = new Set<string>();

export const autorizarBorradoMasivo = (claves: string[]) => claves.forEach(clave => autorizados.add(clave));

/** Si estaba autorizado, lo consume: vale para una sola subida. */
export const consumirAutorizacion = (clave: string) => autorizados.delete(clave);

/** Más de 5 registros y más del 20% de lo que este equipo tenía sincronizado. */
export const esBorradoMasivo = (borrados: number, enBase: number) => borrados > 5 && borrados > enBase * 0.2;
