import { emitStoreEvent, readStore } from '../storeSync';

export const syncEstadoEvent = 'restaurant-sync-estado-updated';

export type EstadoSync = {
  online: boolean;
  pendiente: number;
  hidratando: boolean;
  error: string;
};

const estadoMemoria: EstadoSync = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendiente: 0,
  hidratando: false,
  error: '',
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
  window.localStorage.setItem(colaStorageKey, JSON.stringify(cola));
  setEstadoSync({ pendiente: cola.length });
};
