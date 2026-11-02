import type { CategoriaProducto } from './types';
import { categoriasIniciales } from './mockData';
import { readStore, useStore, writeStore } from './storeSync';

export const categoriasStorageKey = 'restaurant-categorias';
export const categoriasUpdatedEvent = 'restaurant-categorias-updated';

/** Hasta que se edita alguna, son las de la carta. La sync puede dejar null si todavía no hay ninguna subida. */
export const loadCategorias = (): CategoriaProducto[] =>
  readStore<CategoriaProducto[] | null>(categoriasStorageKey, null) ?? categoriasIniciales;

export const saveCategorias = (categorias: CategoriaProducto[]) =>
  writeStore(categoriasStorageKey, categorias, categoriasUpdatedEvent);

export const useCategorias = (): CategoriaProducto[] => useStore(categoriasUpdatedEvent, loadCategorias);
