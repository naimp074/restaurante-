import type { CajaDiaria } from './types';

export const cajasDiariasStorageKey = 'restaurant-cajas-diarias';

export const loadCajasDiarias = (): CajaDiaria[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(cajasDiariasStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as CajaDiaria[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCajasDiarias = (cajas: CajaDiaria[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(cajasDiariasStorageKey, JSON.stringify(cajas));
};
