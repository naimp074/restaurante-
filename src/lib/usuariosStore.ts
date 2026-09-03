import { useEffect, useState } from 'react';
import type { Profile } from './types';

export const usuariosStorageKey = 'restaurant-usuarios';
const usuariosUpdatedEvent = 'restaurant-usuarios-updated';

export const loadUsuarios = (): Profile[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(usuariosStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Profile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveUsuarios = (usuarios: Profile[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(usuariosStorageKey, JSON.stringify(usuarios));
  window.dispatchEvent(new CustomEvent(usuariosUpdatedEvent));
};

/** Mantiene la lista sincronizada entre pantallas abiertas al mismo tiempo. */
export const useUsuarios = (): Profile[] => {
  const [usuarios, setUsuarios] = useState<Profile[]>(loadUsuarios);

  useEffect(() => {
    const sincronizar = () => setUsuarios(loadUsuarios());
    window.addEventListener(usuariosUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(usuariosUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return usuarios;
};

export const useMozas = (): Profile[] =>
  useUsuarios().filter(u => u.activo && (u.rol === 'moza' || u.rol === 'encargado'));
