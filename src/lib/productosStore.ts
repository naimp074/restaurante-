import { useEffect, useState } from 'react';
import type { Producto } from './types';
import { readStore, writeStore } from './storeSync';

export const productosStorageKey = 'restaurant-productos';
export const productosUpdatedEvent = 'restaurant-productos-updated';

export const loadProductos = (): Producto[] => readStore<Producto[]>(productosStorageKey, []);

export const saveProductos = (productos: Producto[]) =>
  writeStore(productosStorageKey, productos, productosUpdatedEvent);

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
