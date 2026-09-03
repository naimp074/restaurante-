import { useEffect, useState } from 'react';
import type { Mesa } from './types';

export type SectorOption = {
  id: string;
  label: string;
};

export const sectoresStorageKey = 'restaurant-sectores-mesas';
export const mesasStorageKey = 'restaurant-mesas';
const mesasUpdatedEvent = 'restaurant-mesas-updated';

export const initialSectores: SectorOption[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'salon', label: 'Salón' },
  { id: 'terraza', label: 'Terraza' },
  { id: 'barra', label: 'Barra' },
  { id: 'privado', label: 'Privado' },
];

export const loadMesas = (): Mesa[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(mesasStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Mesa[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveMesas = (mesas: Mesa[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(mesasStorageKey, JSON.stringify(mesas));
  window.dispatchEvent(new CustomEvent(mesasUpdatedEvent));
};

export const loadSectores = (): SectorOption[] => {
  if (typeof window === 'undefined') return initialSectores;
  try {
    const saved = window.localStorage.getItem(sectoresStorageKey);
    if (!saved) return initialSectores;
    const parsed = JSON.parse(saved) as SectorOption[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : initialSectores;
  } catch {
    return initialSectores;
  }
};

export const saveSectores = (sectores: SectorOption[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(sectoresStorageKey, JSON.stringify(sectores));
};

/** Mantiene las mesas sincronizadas entre pantallas abiertas al mismo tiempo. */
export const useMesas = (): Mesa[] => {
  const [mesas, setMesas] = useState<Mesa[]>(loadMesas);

  useEffect(() => {
    const sincronizar = () => setMesas(loadMesas());
    window.addEventListener(mesasUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(mesasUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return mesas;
};
