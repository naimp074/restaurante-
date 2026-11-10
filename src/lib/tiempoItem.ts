import type { EstadoItem, PedidoItem } from './types';

/**
 * Reloj de cada ítem: corre desde que se pidió (created_at) hasta que cocina lo marca listo.
 * Si se entrega sin pasar por "listo", se frena al entregarlo.
 */
type ConTiempos = Pick<PedidoItem, 'created_at' | 'updated_at' | 'estado' | 'listo_at' | 'entregado_at'>;

/** Cambia el estado guardando la hora: sin esto no se sabría cuándo salió. */
export const conEstado = <T extends ConTiempos>(item: T, estado: EstadoItem, ahora = new Date().toISOString()): T => {
  if (item.estado === estado) return item;
  const cambios: Partial<ConTiempos> = { estado, updated_at: ahora };
  if (estado === 'listo' && !item.listo_at) cambios.listo_at = ahora;
  if (estado === 'entregado') {
    if (!item.entregado_at) cambios.entregado_at = ahora;
    if (!item.listo_at) cambios.listo_at = ahora;
  }
  return { ...item, ...cambios };
};

/** Hora en que salió, o undefined si sigue en preparación. */
export const salidaDeItem = (item: ConTiempos): string | undefined => {
  if (item.listo_at || item.entregado_at) return item.listo_at || item.entregado_at;
  // Ítems de antes de guardar la hora: la última modificación es lo más cercano.
  if (item.estado === 'listo' || item.estado === 'entregado') return item.updated_at;
  return undefined;
};

/** Segundos desde que se pidió hasta que salió (o hasta ahora, si todavía no salió). */
export const segundosDeItem = (item: ConTiempos, ahora = Date.now()) => {
  const fin = salidaDeItem(item);
  const hasta = fin ? new Date(fin).getTime() : ahora;
  return Math.max(0, Math.floor((hasta - new Date(item.created_at).getTime()) / 1000));
};

/** 65 → "1:05"; 3725 → "1h 02m". */
export const formatoReloj = (segundos: number) => {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
};
