import type { Gasto } from './types';
import { readStore, useStore, writeStore } from './storeSync';

export const gastosStorageKey = 'restaurant-gastos';
export const gastosUpdatedEvent = 'restaurant-gastos-updated';

export const loadGastos = () => readStore<Gasto[]>(gastosStorageKey, []);
export const saveGastos = (gastos: Gasto[]) => writeStore(gastosStorageKey, gastos, gastosUpdatedEvent);
export const useGastos = () => useStore(gastosUpdatedEvent, loadGastos);
