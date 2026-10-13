import { supabase } from '../supabase';
import { applyStoreLocally, emitStoreEvent } from '../storeSync';
import type { Rol } from '../types';
import { clavesSync, documentoPorClave, documentosSync } from './documentos';
import { loadColaSync, saveColaSync, setEstadoSync } from './estado';
import { puedeEscribirClave, puedeEscribirRegistro } from './permisos';
import { baseDe, cambiosDesde, fusionarRemotos, reemplazarConRemotos, type RegistroRemoto } from './registros';

type FilaRegistro = RegistroRemoto & {
  clave: string;
  updated_at: string;
};

/** Huella de cada registro tal como quedó en el servidor, por clave. */
const baseStorageKey = 'restaurant-sync-base';
/** Última fecha de cambio remoto vista: al reconectar solo se piden los posteriores. */
const ultimaStorageKey = 'restaurant-sync-ultima';
const tamanioLote = 200;

let localIdActual = '';
let sesion: { rol?: Rol; userId?: string } = {};
let flushTimer: number | undefined;
let cadena: Promise<unknown> = Promise.resolve();
/** Cuenta los cambios locales por clave para no sacar de la cola algo que cambió mientras se subía. */
const versiones = new Map<string, number>();

/** Las operaciones de sync corren de a una: hidratar y subir a la vez mezclaría bases. */
const enSerie = <T,>(tarea: () => Promise<T>): Promise<T> => {
  const resultado = cadena.then(tarea, tarea);
  cadena = resultado.catch(() => undefined);
  return resultado;
};

export const configurarSesionSync = (datos: { rol?: Rol; userId?: string }) => {
  sesion = datos;
};

const leerJson = <T,>(clave: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

type Bases = Record<string, Record<string, string>>;
const loadBases = () => leerJson<Bases>(baseStorageKey, {});
const saveBase = (clave: string, base: Record<string, string>) => {
  const bases = loadBases();
  bases[clave] = base;
  window.localStorage.setItem(baseStorageKey, JSON.stringify(bases));
};

const parseLocal = (clave: string): unknown => leerJson<unknown>(clave, null);

const guardarLocal = (clave: string, valor: unknown) => {
  const def = documentoPorClave(clave);
  if (!def) return;
  if (valor === null || valor === undefined) {
    window.localStorage.removeItem(clave);
    emitStoreEvent(def.evento);
    return;
  }
  applyStoreLocally(clave, valor, def.evento);
};

const registrarUltima = (filas: { updated_at?: string }[]) => {
  const actual = window.localStorage.getItem(ultimaStorageKey) || '';
  const maxima = filas.reduce((max, fila) => (fila.updated_at && fila.updated_at > max ? fila.updated_at : max), actual);
  if (maxima !== actual) window.localStorage.setItem(ultimaStorageKey, maxima);
};

export const programarVaciarCola = () => {
  if (typeof window === 'undefined') return;
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void vaciarColaSync();
  }, 400);
};

export const encolarClave = (clave: string) => {
  if (!clavesSync.has(clave) || typeof window === 'undefined') return;
  versiones.set(clave, (versiones.get(clave) || 0) + 1);
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

const esRechazoDePermiso = (error: { code?: string; message?: string }) =>
  error.code === '42501' || /row-level security|permission denied/i.test(error.message || '');

/** Trae del servidor todos los registros de una clave. */
const leerRemotos = async (localId: string, clave?: string, desde?: string): Promise<FilaRegistro[]> => {
  if (!supabase) return [];
  const filas: FilaRegistro[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    let consulta = supabase
      .from('sync_registros')
      .select('clave, registro_id, payload, eliminado, updated_at')
      .eq('local_id', localId)
      .order('updated_at', { ascending: true })
      .range(desdeFila, desdeFila + 999);
    if (clave) consulta = consulta.eq('clave', clave);
    if (desde) consulta = consulta.gt('updated_at', desde);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    filas.push(...((data || []) as FilaRegistro[]));
    if (!data || data.length < 1000) return filas;
  }
};

/** Deja la clave igual al servidor. Se usa cuando el servidor rechazó un cambio local. */
const refrescarClave = async (localId: string, clave: string) => {
  const filas = await leerRemotos(localId, clave);
  const { valor, base } = reemplazarConRemotos(parseLocal(clave), filas);
  guardarLocal(clave, valor);
  saveBase(clave, base);
};

export const aplicarRegistrosRemotos = (clave: string, filas: (RegistroRemoto & { updated_at?: string })[]) => {
  if (!documentoPorClave(clave) || !filas.length) return;
  const local = parseLocal(clave);
  const resultado = fusionarRemotos(local, loadBases()[clave] || {}, filas);
  if (resultado) {
    if (resultado.valor !== local) guardarLocal(clave, resultado.valor);
    saveBase(clave, resultado.base);
  }
  registrarUltima(filas);
};

const subirClave = async (localId: string, clave: string): Promise<'ok' | 'rechazado'> => {
  if (!supabase) return 'ok';
  const base = { ...(loadBases()[clave] || {}) };
  const cambios = cambiosDesde(parseLocal(clave), base);
  const permitidos = cambios.filter(c => puedeEscribirRegistro(sesion.rol, sesion.userId, clave, c.registroId));
  // Lo que este rol no puede tocar se descarta en silencio: la pantalla ni siquiera es suya.
  let rechazado = permitidos.length < cambios.length;
  let rechazoDelServidor = false;

  for (let i = 0; i < permitidos.length; i += tamanioLote) {
    const lote = permitidos.slice(i, i + tamanioLote);
    const { error } = await supabase.from('sync_registros').upsert(
      lote.map(c => ({
        local_id: localId,
        clave,
        registro_id: c.registroId,
        payload: c.eliminado ? null : c.payload,
        eliminado: c.eliminado,
      })),
      { onConflict: 'local_id,clave,registro_id' },
    );
    if (error) {
      if (esRechazoDePermiso(error)) { rechazado = true; rechazoDelServidor = true; break; }
      throw new Error(error.message);
    }
    lote.forEach(c => {
      if (c.eliminado) delete base[c.registroId];
      else base[c.registroId] = c.huella!;
    });
    saveBase(clave, base);
  }

  if (rechazado) await refrescarClave(localId, clave);
  return rechazoDelServidor ? 'rechazado' : 'ok';
};

export const vaciarColaSync = () => enSerie(async () => {
  if (!supabase || !navigator.onLine) return;
  const cola = loadColaSync();
  if (!cola.length) {
    setEstadoSync({ pendiente: 0, error: '' });
    return;
  }

  let aviso = '';
  try {
    const localId = await resolverLocalId();
    const pendientes = [...cola].sort(
      (a, b) => documentosSync.findIndex(d => d.clave === a) - documentosSync.findIndex(d => d.clave === b),
    );

    for (const clave of pendientes) {
      const version = versiones.get(clave) || 0;
      const resultado = await subirClave(localId, clave);
      if (resultado === 'rechazado') aviso = 'Algunos cambios no se guardaron: tu usuario no tiene permiso para modificarlos.';
      if ((versiones.get(clave) || 0) === version) {
        saveColaSync(loadColaSync().filter(item => item !== clave));
      }
    }
    setEstadoSync({ error: aviso });
    if (loadColaSync().length) programarVaciarCola();
  } catch (error) {
    setEstadoSync({ error: error instanceof Error ? error.message : 'No se pudo sincronizar.' });
  }
});

/** Primera vez con sync por registro: trae los documentos del sistema anterior. */
const migrarDocumentosViejos = async (localId: string) => {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('sync_documentos')
    .select('clave, payload')
    .eq('local_id', localId);
  if (error) return;
  const cola = loadColaSync();
  (data || []).forEach(fila => {
    if (documentoPorClave(fila.clave) && !cola.includes(fila.clave)) guardarLocal(fila.clave, fila.payload);
  });
};

const tieneDatos = (valor: unknown) => {
  if (valor == null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'object') return Object.keys(valor as object).length > 0;
  return true;
};

export const hidratarDesdeRemoto = () => enSerie(async () => {
  if (!supabase) return;
  setEstadoSync({ hidratando: true, error: '' });
  try {
    const localId = await resolverLocalId();
    const ultima = window.localStorage.getItem(ultimaStorageKey) || '';
    const completa = !ultima;
    const filas = await leerRemotos(localId, undefined, ultima || undefined);

    const migrado = completa && !filas.length;
    if (migrado) await migrarDocumentosViejos(localId);

    const porClave = new Map<string, FilaRegistro[]>();
    filas.forEach(fila => {
      if (!porClave.has(fila.clave)) porClave.set(fila.clave, []);
      porClave.get(fila.clave)!.push(fila);
    });

    const bases = loadBases();
    const cola = loadColaSync();
    documentosSync.forEach(({ clave }) => {
      const remotos = porClave.get(clave) || [];
      const soloLectura = !puedeEscribirClave(sesion.rol, clave);
      if (soloLectura && migrado) {
        // Lo trajo el sistema anterior y lo va a subir quien tenga permiso: se toma como
        // ya sincronizado para que los cambios que lleguen después se apliquen.
        saveBase(clave, baseDe(parseLocal(clave)));
      } else if (completa && (soloLectura || (!bases[clave] && !cola.includes(clave) && remotos.length))) {
        // Dispositivo nuevo (o recién actualizado), o datos que este rol solo puede leer:
        // el servidor es la referencia.
        const { valor, base } = reemplazarConRemotos(parseLocal(clave), remotos);
        guardarLocal(clave, valor);
        saveBase(clave, base);
      } else if (remotos.length) {
        aplicarRegistrosRemotos(clave, remotos);
      }

      const local = parseLocal(clave);
      if (!soloLectura && (tieneDatos(local) || bases[clave])) {
        if (cambiosDesde(local, loadBases()[clave] || {}).length) encolarClave(clave);
      }
    });
    registrarUltima(filas);
  } catch (error) {
    setEstadoSync({ error: error instanceof Error ? error.message : 'No se pudieron leer los datos del local.' });
  } finally {
    setEstadoSync({ hidratando: false });
  }
}).then(() => vaciarColaSync());

export const resetLocalIdSync = () => {
  localIdActual = '';
};
