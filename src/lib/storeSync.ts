import { useEffect, useState } from 'react';

type AfterWrite = (key: string) => void;
let afterWrite: AfterWrite | undefined;

/** La capa de sync se engancha acá para subir el cambio sin que los stores sepan de Supabase. */
export const onStoreWrite = (fn?: AfterWrite) => {
  afterWrite = fn;
};

export const emitStoreEvent = (eventName: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName));
};

/** Escribe en el navegador y avisa a las pantallas, sin encolar sync (datos que vienen de remoto). */
export const applyStoreLocally = <T,>(key: string, value: T, eventName: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
  emitStoreEvent(eventName);
};

export const writeStore = <T,>(key: string, value: T, eventName: string) => {
  applyStoreLocally(key, value, eventName);
  afterWrite?.(key);
};

export const readStore = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
};

export const useStore = <T,>(eventName: string, load: () => T): T => {
  const [data, setData] = useState(load);

  useEffect(() => {
    const sincronizar = () => setData(load());
    window.addEventListener(eventName, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(eventName, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, [eventName]);

  return data;
};
