import { supabase } from '../supabase';
import { applyStoreLocally } from '../storeSync';
import { clavesSync, documentoPorClave, documentosSync } from './documentos';
import { loadColaSync, saveColaSync, setEstadoSync } from './estado';

type FilaDocumento = {
  local_id: string;
  clave: string;
  payload: unknown;
  updated_at: string;
};

let localIdActual = '';
let vaciando = false;
let flushTimer: number | undefined;

export const programarVaciarCola = () => {
  if (typeof window === 'undefined') return;
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void vaciarColaSync();
  }, 400);
};

const parseLocal = (clave: string): unknown => {
  try {
    const raw = window.localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const hayDatosLocales = (clave: string) => {
  const valor = parseLocal(clave);
  if (valor == null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'object') return Object.keys(valor as object).length > 0;
  return true;
};

export const encolarClave = (clave: string) => {
  if (!clavesSync.has(clave) || typeof window === 'undefined') return;
  const cola = loadColaSync();
  if (cola.includes(clave)) {
    setEstadoSync({ pendiente: cola.length });
    return;
  }
  saveColaSync([...cola, clave]);
};

export const resolverLocalId = async (): Promise<string> => {
  if (localIdActual) return localIdActual;
  if (!supabase) return '';
  const { data, error } = await supabase.rpc('asignar_local_si_falta');
  if (error || !data) throw new Error(error?.message || 'No pude identificar el local.');
  localIdActual = String(data);
  return localIdActual;
};

export const aplicarDocumentoRemoto = (fila: Pick<FilaDocumento, 'clave' | 'payload'>) => {
  const def = documentoPorClave(fila.clave);
  if (!def || loadColaSync().includes(fila.clave)) return;
  applyStoreLocally(fila.clave, fila.payload, def.evento);
};

export const vaciarColaSync = async () => {
  if (!supabase || vaciando || !navigator.onLine) return;
  const cola = loadColaSync();
  if (!cola.length) {
    setEstadoSync({ pendiente: 0, error: '' });
    return;
  }

  vaciando = true;
  try {
    const localId = await resolverLocalId();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    const pendientes = [...cola].sort(
      (a, b) => documentosSync.findIndex(d => d.clave === a) - documentosSync.findIndex(d => d.clave === b),
    );

    for (const clave of pendientes) {
      const { error } = await supabase.from('sync_documentos').upsert({
        local_id: localId,
        clave,
        payload: parseLocal(clave) ?? null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      });
      if (error) throw new Error(error.message);
      saveColaSync(loadColaSync().filter(item => item !== clave));
    }
    setEstadoSync({ error: '' });
  } catch (error) {
    setEstadoSync({ error: error instanceof Error ? error.message : 'No se pudo sincronizar.' });
  } finally {
    vaciando = false;
  }
};

export const hidratarDesdeRemoto = async () => {
  if (!supabase) return;
  setEstadoSync({ hidratando: true, error: '' });
  try {
    const localId = await resolverLocalId();
    const { data, error } = await supabase
      .from('sync_documentos')
      .select('local_id, clave, payload, updated_at')
      .eq('local_id', localId);
    if (error) throw new Error(error.message);

    const remotos = (data || []) as FilaDocumento[];
    if (!remotos.length) {
      documentosSync.forEach(doc => {
        if (hayDatosLocales(doc.clave)) encolarClave(doc.clave);
      });
      await vaciarColaSync();
      return;
    }

    remotos.forEach(aplicarDocumentoRemoto);
    documentosSync.forEach(doc => {
      if (!remotos.some(row => row.clave === doc.clave) && hayDatosLocales(doc.clave)) {
        encolarClave(doc.clave);
      }
    });
    await vaciarColaSync();
  } catch (error) {
    setEstadoSync({ error: error instanceof Error ? error.message : 'No se pudieron leer los datos del local.' });
  } finally {
    setEstadoSync({ hidratando: false });
  }
};

export const resetLocalIdSync = () => {
  localIdActual = '';
};
