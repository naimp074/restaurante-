/**
 * Jornada comercial: lo que se vende después de medianoche pertenece al día que abrió.
 * Con hora de corte 5, un cobro a las 01:30 del sábado cuenta para el viernes y la caja
 * abierta el viernes a la noche sigue siendo "la de hoy" hasta las 05:00.
 * Se configura en Configuración; 0 vuelve al día calendario.
 */
export const horaCortePorDefecto = 5;
const configStorageKey = 'restaurant-config-local';

export const horaCorteJornada = (): number => {
  try {
    if (typeof window === 'undefined') return horaCortePorDefecto;
    const raw = window.localStorage.getItem(configStorageKey);
    const valor = raw ? Number((JSON.parse(raw) as { hora_corte?: unknown }).hora_corte) : NaN;
    return Number.isInteger(valor) && valor >= 0 && valor <= 12 ? valor : horaCortePorDefecto;
  } catch {
    return horaCortePorDefecto;
  }
};

const fechaSola = /^\d{4}-\d{2}-\d{2}$/;

/** Corre la fecha hacia atrás la hora de corte: así cae en el día de su jornada. */
const enJornada = (date: Date) => new Date(date.getTime() - horaCorteJornada() * 3_600_000);

/**
 * Clave de día (YYYY-MM-DD) de la jornada, en hora local.
 * No se puede usar toISOString(): devuelve UTC, así que en Argentina a partir de las 21hs
 * los cobros de la noche caerían en el día siguiente y la caja del día quedaría en cero.
 */
export const dayKey = (fecha: Date | string = new Date()) => {
  // Una fecha sin hora ya es un día: new Date('2026-10-13') sería medianoche UTC (el 12 acá).
  if (typeof fecha === 'string' && fechaSola.test(fecha)) return fecha;
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (Number.isNaN(date.getTime())) return '';
  const jornada = enJornada(date);
  const mes = `${jornada.getMonth() + 1}`.padStart(2, '0');
  const dia = `${jornada.getDate()}`.padStart(2, '0');
  return `${jornada.getFullYear()}-${mes}-${dia}`;
};

export const esHoy = (fecha: Date | string) => dayKey(fecha) === dayKey();

/** Medianoche del día de la jornada a la que pertenece la fecha (para agrupar reportes). */
export const inicioJornada = (fecha: Date | string) => {
  const date = enJornada(typeof fecha === 'string' ? new Date(fecha) : fecha);
  date.setHours(0, 0, 0, 0);
  return date;
};
