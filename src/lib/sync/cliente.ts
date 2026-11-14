import { supabase } from '../supabase';
import { applyStoreLocally, emitStoreEvent } from '../storeSync';
import type { Rol } from '../types';
import { clavesSync, documentoPorClave, documentosSync } from './documentos';
import { loadColaSync, saveColaSync, setEstadoSync } from './estado';
import { puedeEscribirClave, puedeEscribirRegistro } from './permisos';
import { aplanar, baseDe, cambiosDesde, fusionarRemotos, huella, rearmar, reemplazarConRemotos, type CambioLocal, type RegistroRemoto } from './registros';
import { clavesConBaseCompleta, resolverConflicto } from './conflictos';

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

/**
 * Para la caja, las cuentas y las comandas abiertas se guarda también cómo era cada registro la última
 * vez que estuvo igual al servidor: si dos equipos lo cambian a la vez, se sabe qué cambió cada uno.
 */
const baseDatosStorageKey = 'restaurant-sync-base-datos';
type BaseDatos = Record<string, Record<string, { h: string; p: unknown }>>;
const loadBaseDatos = () => leerJson<BaseDatos>(baseDatosStorageKey, {});
const pedidoCerrado = (valor: unknown) =>
  typeof valor === 'object' && valor !== null && ['cobrado', 'cuenta_corriente', 'cancelado'].includes(String((valor as { estado?: unknown }).estado));

const parseLocal = (clave: string): unknown => leerJson<unknown>(clave, null);

const saveBase = (clave: string, base: Record<string, string>, extras?: Map<string, unknown>) => {
  const bases = loadBases();
  bases[clave] = base;
  window.localStorage.setItem(baseStorageKey, JSON.stringify(bases));
  if (!clavesConBaseCompleta.has(clave)) return;

  const todos = loadBaseDatos();
  const anterior = todos[clave] || {};
  const locales = aplanar(parseLocal(clave));
  const siguiente: Record<string, { h: string; p: unknown }> = {};
  Object.entries(base).forEach(([id, h]) => {
    if (anterior[id]?.h === h) { siguiente[id] = anterior[id]; return; }
    const candidato = [extras?.get(id), locales.get(id)].find(valor => valor !== undefined && huella(valor) === h);
    // Las comandas cerradas no se vuelven a editar: no hace falta guardarlas (y la lista crece mucho).
    if (candidato !== undefined && !(clave === 'restaurant-demo-pedidos' && pedidoCerrado(candidato))) siguiente[id] = { h, p: candidato };
  });
  todos[clave] = siguiente;
  try {
    window.localStorage.setItem(baseDatosStorageKey, JSON.stringify(todos));
  } catch {
    // Sin lugar: se resuelve igual, solo que sin saber qué cambió cada lado.
  }
};

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

/** Cómo están ahora en el servidor los registros que se van a subir. */
const leerActuales = async (localId: string, clave: string, ids: string[]) => {
  const actuales = new Map<string, RegistroRemoto>();
  if (!supabase) return actuales;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('sync_registros')
      .select('registro_id, payload, eliminado')
      .eq('local_id', localId)
      .eq('clave', clave)
      .in('registro_id', ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    ((data || []) as RegistroRemoto[]).forEach(fila => actuales.set(fila.registro_id, fila));
  }
  return actuales;
};

/**
 * Antes de subir, se mira si otro equipo cambió el mismo registro desde la última vez que se bajó.
 * Si lo cambió, no se pisa: se combinan los dos cambios (o se queda el del otro) y se avisa.
 */
const resolverChoques = async (localId: string, clave: string, base: Record<string, string>, cambios: CambioLocal[]) => {
  const actuales = await leerActuales(localId, clave, cambios.map(c => c.registroId));
  const aSubir: CambioLocal[] = [];
  const resueltos = new Map<string, unknown>();
  const delServidor = new Map<string, unknown>();
  const avisos: string[] = [];

  cambios.forEach(cambio => {
    const fila = actuales.get(cambio.registroId);
    const remoto = fila && !fila.eliminado ? fila.payload : undefined;
    const huellaRemota = remoto === undefined ? undefined : huella(remoto);
    const huellaLocal = cambio.eliminado ? undefined : cambio.huella;
    if (huellaRemota === base[cambio.registroId] || huellaRemota === huellaLocal) {
      aSubir.push(cambio);
      return;
    }
    const baseDatos = loadBaseDatos()[clave]?.[cambio.registroId];
    const anterior = baseDatos && baseDatos.h === base[cambio.registroId] ? baseDatos.p : undefined;
    const { valor, aviso } = resolverConflicto(clave, cambio.eliminado ? undefined : cambio.payload, remoto, anterior);
    if (aviso && !avisos.includes(aviso)) avisos.push(aviso);
    resueltos.set(cambio.registroId, valor);
    if (huellaRemota === undefined) delete base[cambio.registroId];
    else { base[cambio.registroId] = huellaRemota; delServidor.set(cambio.registroId, remoto); }
    const huellaFinal = valor === undefined ? undefined : huella(valor);
    if (huellaFinal !== huellaRemota) {
      aSubir.push({ registroId: cambio.registroId, payload: valor ?? null, eliminado: valor === undefined, huella: huellaFinal });
    }
  });

  if (resueltos.size) {
    const local = parseLocal(clave);
    const registros = aplanar(local);
    resueltos.forEach((valor, id) => {
      if (valor === undefined) registros.delete(id);
      else registros.set(id, valor);
    });
    guardarLocal(clave, rearmar(registros, local));
    saveBase(clave, base, delServidor);
  }
  return { aSubir, avisos };
};

const subirClave = async (localId: string, clave: string): Promise<{ resultado: 'ok' | 'rechazado'; avisos: string[] }> => {
  if (!supabase) return { resultado: 'ok', avisos: [] };
  const base = { ...(loadBases()[clave] || {}) };
  const cambios = cambiosDesde(parseLocal(clave), base);
  const autorizados = cambios.filter(c => puedeEscribirRegistro(sesion.rol, sesion.userId, clave, c.registroId));
  // Lo que este rol no puede tocar se descarta en silencio: la pantalla ni siquiera es suya.
  let rechazado = autorizados.length < cambios.length;
  let rechazoDelServidor = false;
  const { aSubir: permitidos, avisos } = autorizados.length
    ? await resolverChoques(localId, clave, base, autorizados)
    : { aSubir: [], avisos: [] };

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
  return { resultado: rechazoDelServidor ? 'rechazado' : 'ok', avisos };
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

    const choques: string[] = [];
    for (const clave of pendientes) {
      const version = versiones.get(clave) || 0;
      const { resultado, avisos } = await subirClave(localId, clave);
      if (resultado === 'rechazado') aviso = 'Algunos cambios no se guardaron: tu usuario no tiene permiso para modificarlos.';
      avisos.forEach(texto => { if (!choques.includes(texto)) choques.push(texto); });
      if ((versiones.get(clave) || 0) === version) {
        saveColaSync(loadColaSync().filter(item => item !== clave));
      }
    }
    if (choques.length) {
      const choque = `Se cambió lo mismo en otro equipo al mismo tiempo: ${choques.join('; ')}.`;
      aviso = aviso ? `${aviso} ${choque}` : choque;
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
