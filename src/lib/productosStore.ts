import { useEffect, useState } from 'react';
import type { Producto } from './types';

export const productosStorageKey = 'restaurant-productos';
const productosUpdatedEvent = 'restaurant-productos-updated';

export const loadProductos = (): Producto[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(productosStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Producto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveProductos = (productos: Producto[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(productosStorageKey, JSON.stringify(productos));
  window.dispatchEvent(new CustomEvent(productosUpdatedEvent));
};

/** Mantiene el catálogo sincronizado entre pantallas abiertas al mismo tiempo. */
export const useProductos = (): Producto[] => {
  const [productos, setProductos] = useState<Producto[]>(loadProductos);

  useEffect(() => {
    const sincronizar = () => setProductos(loadProductos());
    window.addEventListener(productosUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(productosUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return productos;
};
