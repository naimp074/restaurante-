import { useEffect, useState } from 'react';
import type { Proveedor } from './types';

export const proveedoresStorageKey = 'restaurant-proveedores';
const proveedoresUpdatedEvent = 'restaurant-proveedores-updated';

// Se consulta una vez por fila al listar insumos, así que evitamos releer y
// parsear el storage en cada llamada.
let cache: Proveedor[] | null = null;

const leerStorage = (): Proveedor[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(proveedoresStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Proveedor[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadProveedores = (): Proveedor[] => {
  if (!cache) cache = leerStorage();
  return cache;
};

export const saveProveedores = (proveedores: Proveedor[]) => {
  if (typeof window === 'undefined') return;
  cache = proveedores;
  window.localStorage.setItem(proveedoresStorageKey, JSON.stringify(proveedores));
  window.dispatchEvent(new CustomEvent(proveedoresUpdatedEvent));
};

/** Mantiene los proveedores sincronizados entre pantallas abiertas al mismo tiempo. */
export const useProveedores = (): Proveedor[] => {
  const [proveedores, setProveedores] = useState<Proveedor[]>(loadProveedores);

  useEffect(() => {
    const sincronizar = () => {
      cache = null;
      setProveedores(loadProveedores());
    };
    window.addEventListener(proveedoresUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(proveedoresUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return proveedores;
};
