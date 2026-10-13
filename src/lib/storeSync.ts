import { useCallback, useEffect, useState, type SetStateAction } from 'react';

type AfterWrite = (key: string) => void;
let afterWrite: AfterWrite | undefined;
let transaction: { previous: Map<string, string | null>; events: Set<string>; keys: Set<string> } | undefined;
const writeTimes = new Map<string, number>();

export const resetStoreWriteMarks = () => writeTimes.clear();

export const markStoreWrite = (key: string, at = Date.now()) => {
  writeTimes.set(key, at);
};

/** Evita que un fetch/sync viejo pise una escritura local más nueva (p. ej. un Excel recién cargado). */
export const debeAplicarRemoto = (key: string, remotoUpdatedAt?: string | null) => {
  const local = writeTimes.get(key);
  if (!local) return true;
  if (!remotoUpdatedAt) return true;
  const remoto = Date.parse(remotoUpdatedAt);
  if (!Number.isFinite(remoto)) return true;
  return remoto > local;
};

/** Agrupa escrituras síncronas: notifica y sincroniza solo cuando todas se guardaron. */
export const withStoreTransaction = <T,>(action: () => T): T => {
  if (transaction) return action();
  const current = { previous: new Map<string, string | null>(), events: new Set<string>(), keys: new Set<string>() };
  transaction = current;
  let result: T;
  try {
    result = action();
    current.keys.forEach(key => afterWrite?.(key));
  } catch (error) {
    transaction = undefined;
    current.previous.forEach((value, key) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    });
    throw error;
  }
  transaction = undefined;
  current.events.forEach(emitStoreEvent);
  return result;
};

/** La capa de sync se engancha acá para subir el cambio sin que los stores sepan de Supabase. */
export const onStoreWrite = (fn?: AfterWrite) => {
  afterWrite = fn;
};

export const emitStoreEvent = (eventName: string) => {
  if (typeof window === 'undefined') return;
  if (transaction) { transaction.events.add(eventName); return; }
  window.dispatchEvent(new CustomEvent(eventName));
};

/** Escribe en el navegador y avisa a las pantallas, sin encolar sync (datos que vienen de remoto). */
export const applyStoreLocally = <T,>(key: string, value: T, eventName: string) => {
  if (typeof window === 'undefined') return;
  if (transaction && !transaction.previous.has(key)) transaction.previous.set(key, window.localStorage.getItem(key));
  window.localStorage.setItem(key, JSON.stringify(value));
  emitStoreEvent(eventName);
};

export const writeStore = <T,>(key: string, value: T, eventName: string) => {
  applyStoreLocally(key, value, eventName);
  markStoreWrite(key);
  if (transaction) transaction.keys.add(key);
  else afterWrite?.(key);
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
    sincronizar();
    return () => {
      window.removeEventListener(eventName, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, [eventName, load]);

  return data;
};

export const useStoredState = <T,>(eventName: string, load: () => T, save: (value: T) => void) => {
  const data = useStore(eventName, load);
  const setData = useCallback((update: SetStateAction<T>) => {
    save(typeof update === 'function' ? (update as (previous: T) => T)(load()) : update);
  }, [load, save]);
  return [data, setData] as const;
};
