import { applyStoreLocally, emitStoreEvent, readStore } from '../storeSync';

export const syncEstadoEvent = 'restaurant-sync-estado-updated';

export type EstadoSync = {
  online: boolean;
  pendiente: number;
  hidratando: boolean;
  error: string;
  /** El canal en vivo con Supabase está conectado: lo que hacen los otros equipos llega al instante. */
  enVivo: boolean;
};

const estadoMemoria: EstadoSync = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendiente: 0,
  hidratando: false,
  error: '',
  enVivo: false,
};

export const loadEstadoSync = (): EstadoSync => ({ ...estadoMemoria });

export const setEstadoSync = (parcial: Partial<EstadoSync>) => {
  Object.assign(estadoMemoria, parcial);
  if (typeof window !== 'undefined') emitStoreEvent(syncEstadoEvent);
};

export const colaStorageKey = 'restaurant-sync-cola';

export const loadColaSync = (): string[] => {
  const cola = readStore<string[]>(colaStorageKey, []);
  return Array.isArray(cola) ? cola : [];
};

export const saveColaSync = (cola: string[]) => {
  if (typeof window === 'undefined') return;
  applyStoreLocally(colaStorageKey, cola, syncEstadoEvent);
  setEstadoSync({ pendiente: cola.length });
};
