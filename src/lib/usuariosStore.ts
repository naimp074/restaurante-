import { useEffect, useState } from 'react';
import type { Profile } from './types';
import { readStore, writeStore } from './storeSync';

export const usuariosStorageKey = 'restaurant-usuarios';
export const usuariosUpdatedEvent = 'restaurant-usuarios-updated';

export const loadUsuarios = (): Profile[] => readStore<Profile[]>(usuariosStorageKey, []);

export const saveUsuarios = (usuarios: Profile[]) =>
  writeStore(usuariosStorageKey, usuarios, usuariosUpdatedEvent);

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

/** El que inicia sesión también puede tomar comandas, aunque no lo hayan cargado en Usuarios. */
export const asegurarUsuarioLocal = (perfil: Profile) => {
  const actuales = loadUsuarios();
  if (actuales.some(usuario => usuario.id === perfil.id)) {
    saveUsuarios(actuales.map(usuario => (usuario.id === perfil.id ? { ...usuario, ...perfil, activo: true } : usuario)));
    return;
  }
  saveUsuarios([...actuales, { ...perfil, activo: true }]);
};
