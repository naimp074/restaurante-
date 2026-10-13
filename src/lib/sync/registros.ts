/**
 * Cada store del navegador se guarda como un solo JSON (una lista de pedidos, un objeto
 * de cuenta corriente...). Para sincronizar sin que dos dispositivos se pisen, ese JSON
 * se parte en registros con un id estable:
 *
 *   [{ id: 'a' }, { id: 'b' }]              -> '#a', '#b'
 *   { clientes: [{ id: 'c' }], iva: '21' }  -> '.clientes' (marca de lista), '.clientes#c', '.iva'
 *   cualquier otra cosa                      -> '=' (el documento entero)
 */

export const registroDocumento = '=';

type ConId = { id: string | number };

const esObjetoPlano = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const tieneId = (valor: unknown): valor is ConId =>
  esObjetoPlano(valor) && (typeof valor.id === 'string' || typeof valor.id === 'number') && String(valor.id) !== '';

/** Una lista se parte por id solo si todos sus elementos tienen un id distinto. */
const esListaConIds = (valor: unknown): valor is ConId[] => {
  if (!Array.isArray(valor) || !valor.every(tieneId)) return false;
  return new Set(valor.map(item => String(item.id))).size === valor.length;
};

export const aplanar = (valor: unknown): Map<string, unknown> => {
  const registros = new Map<string, unknown>();
  if (valor === null || valor === undefined) return registros;

  if (esListaConIds(valor)) {
    valor.forEach(item => registros.set(`#${item.id}`, item));
    return registros;
  }

  if (esObjetoPlano(valor)) {
    Object.entries(valor).forEach(([campo, contenido]) => {
      if (contenido === undefined) return;
      if (esListaConIds(contenido)) {
        // La marca conserva el campo aunque la lista quede vacía.
        registros.set(`.${campo}`, []);
        contenido.forEach(item => registros.set(`.${campo}#${item.id}`, item));
      } else {
        registros.set(`.${campo}`, contenido);
      }
    });
    return registros;
  }

  registros.set(registroDocumento, valor);
  return registros;
};

const fechaDe = (item: unknown) => {
  if (!esObjetoPlano(item)) return '';
  const fecha = item.created_at ?? item.fecha;
  return typeof fecha === 'string' ? fecha : '';
};

/**
 * Respeta el orden que ya tenía la lista local. Los registros nuevos se ubican según
 * el sentido de la lista: si arranca por el más reciente, van adelante.
 */
const ordenarComoPlantilla = (items: Map<string, unknown>, plantilla: unknown): unknown[] => {
  const previos = Array.isArray(plantilla) ? plantilla.filter(tieneId) : [];
  const vistos = new Set<string>();
  const resultado: unknown[] = [];

  previos.forEach(item => {
    const id = String(item.id);
    if (!items.has(id) || vistos.has(id)) return;
    vistos.add(id);
    resultado.push(items.get(id));
  });

  const nuevos = [...items.entries()].filter(([id]) => !vistos.has(id)).map(([, item]) => item);
  if (!nuevos.length) return resultado;

  const primera = fechaDe(previos[0]);
  const ultima = fechaDe(previos[previos.length - 1]);
  const recientePrimero = Boolean(primera && ultima && primera > ultima);
  nuevos.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));
  return recientePrimero ? [...nuevos.reverse(), ...resultado] : [...resultado, ...nuevos];
};

/** Inverso de aplanar. La plantilla (el valor local anterior) define el orden de las listas. */
export const rearmar = (registros: Map<string, unknown>, plantilla: unknown): unknown => {
  if (registros.has(registroDocumento)) return registros.get(registroDocumento);

  const claves = [...registros.keys()];
  const esLista = claves.some(clave => clave.startsWith('#'));
  const esObjeto = claves.some(clave => clave.startsWith('.'));

  if (esLista || (!esObjeto && Array.isArray(plantilla))) {
    const items = new Map<string, unknown>();
    claves.filter(clave => clave.startsWith('#')).forEach(clave => items.set(clave.slice(1), registros.get(clave)));
    return ordenarComoPlantilla(items, plantilla);
  }

  if (esObjeto) {
    const objeto: Record<string, unknown> = {};
    const listas = new Map<string, Map<string, unknown>>();

    claves.forEach(clave => {
      const separador = clave.indexOf('#');
      if (separador === -1) {
        objeto[clave.slice(1)] = registros.get(clave);
        return;
      }
      const campo = clave.slice(1, separador);
      if (!listas.has(campo)) listas.set(campo, new Map());
      listas.get(campo)!.set(clave.slice(separador + 1), registros.get(clave));
    });

    listas.forEach((items, campo) => {
      const anterior = esObjetoPlano(plantilla) ? plantilla[campo] : undefined;
      objeto[campo] = ordenarComoPlantilla(items, anterior);
    });
    return objeto;
  }

  if (esObjetoPlano(plantilla)) return {};
  return null;
};

/** JSON con las claves ordenadas: Postgres (jsonb) reordena las claves al guardar. */
const jsonEstable = (valor: unknown): string => {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(item => (item === undefined ? 'null' : jsonEstable(item))).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  const partes = Object.keys(objeto)
    .filter(clave => objeto[clave] !== undefined && typeof objeto[clave] !== 'function')
    .sort()
    .map(clave => `${JSON.stringify(clave)}:${jsonEstable(objeto[clave])}`);
  return `{${partes.join(',')}}`;
};

/** Huella corta (FNV-1a de 32 bits) para saber si un registro cambió desde la última subida. */
export const huella = (valor: unknown): string => {
  const texto = jsonEstable(valor);
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}.${texto.length.toString(36)}`;
};

export type CambioLocal = { registroId: string; payload: unknown; eliminado: boolean; huella?: string };

/** Registros que cambiaron (o se borraron) desde la última vez que se subieron. */
export const cambiosDesde = (valor: unknown, base: Record<string, string>): CambioLocal[] => {
  const registros = aplanar(valor);
  const cambios: CambioLocal[] = [];
  registros.forEach((payload, registroId) => {
    const actual = huella(payload);
    if (base[registroId] !== actual) cambios.push({ registroId, payload, eliminado: false, huella: actual });
  });
  Object.keys(base).forEach(registroId => {
    if (!registros.has(registroId)) cambios.push({ registroId, payload: null, eliminado: true });
  });
  return cambios;
};

/** Toma el valor actual como si ya estuviera subido. */
export const baseDe = (valor: unknown): Record<string, string> => {
  const base: Record<string, string> = {};
  aplanar(valor).forEach((payload, registroId) => { base[registroId] = huella(payload); });
  return base;
};

export type RegistroRemoto ={ registro_id: string; payload: unknown; eliminado: boolean };

/**
 * Aplica registros remotos sobre el valor local. Si un registro cambió acá y todavía no
 * se subió, gana el local (se sube después). Devuelve undefined si no hubo cambios.
 */
export const fusionarRemotos = (
  local: unknown,
  base: Record<string, string>,
  remotos: RegistroRemoto[],
): { valor: unknown; base: Record<string, string> } | undefined => {
  const registros = aplanar(local);
  const nuevaBase = { ...base };
  let cambio = false;

  remotos.forEach(remoto => {
    const id = remoto.registro_id;
    const huellaLocal = registros.has(id) ? huella(registros.get(id)) : undefined;
    if (huellaLocal !== base[id]) return;

    if (remoto.eliminado) {
      delete nuevaBase[id];
      if (registros.delete(id)) cambio = true;
      return;
    }

    const huellaRemota = huella(remoto.payload);
    nuevaBase[id] = huellaRemota;
    if (huellaRemota === huellaLocal) return;
    registros.set(id, remoto.payload);
    cambio = true;
  });

  const baseCambio = JSON.stringify(nuevaBase) !== JSON.stringify(base);
  if (!cambio && !baseCambio) return undefined;
  return { valor: cambio ? rearmar(registros, local) : local, base: nuevaBase };
};

/** Arma el valor solo con lo remoto: se usa la primera vez que el dispositivo se sincroniza. */
export const reemplazarConRemotos = (local: unknown, remotos: RegistroRemoto[]) => {
  const registros = new Map<string, unknown>();
  const base: Record<string, string> = {};
  remotos.filter(remoto => !remoto.eliminado).forEach(remoto => {
    registros.set(remoto.registro_id, remoto.payload);
    base[remoto.registro_id] = huella(remoto.payload);
  });
  return { valor: rearmar(registros, local), base };
};
