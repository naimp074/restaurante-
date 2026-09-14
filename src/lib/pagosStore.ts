import type { Pago } from './types';
import { readStore, useStore, writeStore } from './storeSync';

export const pagosStorageKey = 'restaurant-pagos';
export const pagosUpdatedEvent = 'restaurant-pagos-updated';

export const loadPagos = () => readStore<Pago[]>(pagosStorageKey, []);
export const savePagos = (pagos: Pago[]) => writeStore(pagosStorageKey, pagos, pagosUpdatedEvent);
export const usePagos = () => useStore(pagosUpdatedEvent, loadPagos);
