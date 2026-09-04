/**
 * Clave de día (YYYY-MM-DD) en hora local.
 * No se puede usar toISOString(): devuelve UTC, así que en Argentina a partir de las 21hs
 * los cobros de la noche caerían en el día siguiente y la caja del día quedaría en cero.
 */
export const dayKey = (fecha: Date | string = new Date()) => {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (Number.isNaN(date.getTime())) return '';
  const mes = `${date.getMonth() + 1}`.padStart(2, '0');
  const dia = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
};

export const esHoy = (fecha: Date | string) => dayKey(fecha) === dayKey();
