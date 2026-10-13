import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

/*
  Sincronización por registro con un Supabase simulado en memoria y dos "dispositivos"
  (cada uno con su propio localStorage). No toca ningún dato real.
*/

const compilar = async (contenido, nombre) => {
  const compiled = await build({
    stdin: { contents: contenido, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'supabase-falso',
      setup(b) {
        b.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'supabase-falso', namespace: 'falso' }));
        b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({
          contents: 'export const supabase = globalThis.__supabaseFalso; export const isSupabaseConfigured = true;',
          loader: 'js',
        }));
      },
    }],
  });
  const mod = new Module(path.resolve(`tests/${nombre}.compiled.cjs`));
  mod.filename = path.resolve(`tests/${nombre}.compiled.cjs`);
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};

// ---------- Supabase en memoria ----------
const servidor = { filas: new Map(), documentos: [], reloj: 0, rol: 'admin', userId: 'u-admin', permiso: null };

const consulta = filasFn => {
  const filtros = [];
  let desde = 0;
  let hasta = Infinity;
  const q = {
    select: () => q,
    order: () => q,
    eq: (campo, valor) => { filtros.push(f => f[campo] === valor); return q; },
    gt: (campo, valor) => { filtros.push(f => f[campo] > valor); return q; },
    range: (a, b) => { desde = a; hasta = b; return q; },
    then: (ok, mal) => Promise.resolve({
      data: filasFn().filter(f => filtros.every(fn => fn(f)))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(desde, hasta + 1).map(f => structuredClone(f)),
      error: null,
    }).then(ok, mal),
  };
  return q;
};

globalThis.__supabaseFalso = {
  rpc: async () => ({ data: 'local-1', error: null }),
  auth: { getSession: async () => ({ data: { session: { user: { id: servidor.userId } } } }) },
  from: tabla => ({
    select: () => (tabla === 'sync_documentos' ? consulta(() => servidor.documentos) : consulta(() => [...servidor.filas.values()])),
    upsert: async filas => {
      if (servidor.permiso && filas.some(f => !servidor.permiso(f))) {
        return { error: { code: '42501', message: 'new row violates row-level security policy' } };
      }
      filas.forEach(f => {
        servidor.reloj += 1;
        const updated_at = `2026-10-13T00:00:${String(servidor.reloj).padStart(6, '0')}Z`;
        servidor.filas.set(`${f.clave}|${f.registro_id}`, { ...structuredClone(f), updated_at });
      });
      return { error: null };
    },
  }),
};

const api = await compilar(`
  export * from './src/lib/sync/registros';
  export * from './src/lib/sync/permisos';
  export * from './src/lib/sync/cliente';
  export * from './src/lib/sync/estado';
  export * from './src/lib/storeSync';
  export * from './src/lib/ids';
`, 'syncRegistros');

// ---------- Dispositivos ----------
const crearDispositivo = () => {
  const storage = new Map();
  const win = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  return { storage, win };
};

let dispositivos;
/** Ejecuta una operación "en" un dispositivo: cada uno tiene su propio navegador. */
const en = async (nombre, fn) => {
  globalThis.window = dispositivos[nombre].win;
  api.resetLocalIdSync();
  return fn();
};
const leer = (nombre, clave) => JSON.parse(dispositivos[nombre].storage.get(clave) ?? 'null');
const pedidos = 'restaurant-demo-pedidos';

beforeEach(() => {
  servidor.filas.clear();
  servidor.documentos = [];
  servidor.reloj = 0;
  servidor.permiso = null;
  dispositivos = { tablet: crearDispositivo(), caja: crearDispositivo() };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  api.configurarSesionSync({ rol: 'admin', userId: 'u-admin' });
  api.onStoreWrite(clave => api.encolarClave(clave));
});

// ---------- Lógica pura ----------
test('una lista con ids se parte en un registro por elemento y se rearma igual', () => {
  const lista = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
  const registros = api.aplanar(lista);
  assert.deepEqual([...registros.keys()], ['#a', '#b']);
  assert.deepEqual(api.rearmar(registros, lista), lista);
});

test('la cuenta corriente (objeto con listas) conserva sus listas aunque estén vacías', () => {
  const cuenta = { clientes: [{ id: 'c1', nombre: 'Juan' }], movimientos: [] };
  const registros = api.aplanar(cuenta);
  assert.deepEqual([...registros.keys()].sort(), ['.clientes', '.clientes#c1', '.movimientos']);
  assert.deepEqual(api.rearmar(registros, null), cuenta);
});

test('lo que no tiene ids viaja como documento entero', () => {
  const valor = [{ sinId: true }];
  assert.deepEqual([...api.aplanar(valor).keys()], ['=']);
  assert.deepEqual(api.rearmar(api.aplanar(valor), null), valor);
});

test('la huella no cambia si Postgres reordena las claves del JSON', () => {
  assert.equal(api.huella({ a: 1, b: { c: 2, d: 3 } }), api.huella({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(api.huella({ a: 1 }), api.huella({ a: 2 }));
});

test('solo se suben los registros que cambiaron y las bajas', () => {
  const base = api.baseDe([{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }]);
  const cambios = api.cambiosDesde([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'd', n: 1 }], base);
  assert.deepEqual(cambios.map(c => `${c.registroId}:${c.eliminado}`).sort(), ['#b:false', '#c:true', '#d:false']);
});

test('un cambio remoto no pisa un registro modificado acá que todavía no se subió', () => {
  const base = api.baseDe([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);
  const local = [{ id: 'a', n: 99 }, { id: 'b', n: 1 }];
  const r = api.fusionarRemotos(local, base, [
    { registro_id: '#a', payload: { id: 'a', n: 2 }, eliminado: false },
    { registro_id: '#b', payload: { id: 'b', n: 2 }, eliminado: false },
  ]);
  assert.deepEqual(r.valor, [{ id: 'a', n: 99 }, { id: 'b', n: 2 }]);
});

test('los registros nuevos respetan el sentido de la lista (más reciente primero)', () => {
  const local = [{ id: 'b', created_at: '2026-10-02' }, { id: 'a', created_at: '2026-10-01' }];
  const r = api.fusionarRemotos(local, api.baseDe(local), [
    { registro_id: '#c', payload: { id: 'c', created_at: '2026-10-03' }, eliminado: false },
  ]);
  assert.deepEqual(r.valor.map(x => x.id), ['c', 'b', 'a']);
});

test('los permisos por rol coinciden con lo que hace cada pantalla', () => {
  assert.equal(api.puedeEscribirRegistro('moza', 'u1', pedidos, '#p1'), true);
  assert.equal(api.puedeEscribirRegistro('moza', 'u1', 'restaurant-pagos', '#x'), false);
  assert.equal(api.puedeEscribirRegistro('cajero', 'u1', 'restaurant-pagos', '#x'), true);
  assert.equal(api.puedeEscribirRegistro('cajero', 'u1', 'restaurant-productos', '#x'), false);
  assert.equal(api.puedeEscribirRegistro('cocina', 'u1', 'restaurant-usuarios', '#u1'), true);
  assert.equal(api.puedeEscribirRegistro('cocina', 'u1', 'restaurant-usuarios', '#u2'), false);
  assert.equal(api.puedeEscribirRegistro('encargado', 'u1', 'restaurant-config-local', '.nombre'), true);
});

test('los ids son únicos aunque no exista crypto.randomUUID (http en la red del local)', () => {
  const original = globalThis.crypto.randomUUID;
  try {
    globalThis.crypto.randomUUID = undefined;
    const ids = new Set(Array.from({ length: 2000 }, () => api.nuevoId('pago')));
    assert.equal(ids.size, 2000);
    assert.match([...ids][0], /^pago-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    globalThis.crypto.randomUUID = original;
  }
});

// ---------- Dos dispositivos ----------
const guardarPedidos = lista => api.writeStore(pedidos, lista, 'restaurant-pedidos-updated');

test('dos dispositivos que cargan pedidos distintos al mismo tiempo no se pisan', async () => {
  await en('tablet', async () => { guardarPedidos([{ id: 'p-mesa1', total: 100 }]); });
  await en('caja', async () => { guardarPedidos([{ id: 'p-mesa2', total: 200 }]); });

  await en('tablet', () => api.vaciarColaSync());
  await en('caja', () => api.vaciarColaSync());
  await en('tablet', () => api.hidratarDesdeRemoto());
  await en('caja', () => api.hidratarDesdeRemoto());

  const ids = nombre => leer(nombre, pedidos).map(p => p.id).sort();
  assert.deepEqual(ids('tablet'), ['p-mesa1', 'p-mesa2']);
  assert.deepEqual(ids('caja'), ['p-mesa1', 'p-mesa2']);
  assert.equal(servidor.filas.size, 2);
});

test('editar un pedido sube solo ese registro y la baja llega al otro dispositivo', async () => {
  await en('tablet', async () => { guardarPedidos([{ id: 'p1', total: 1 }, { id: 'p2', total: 2 }]); });
  await en('tablet', () => api.vaciarColaSync());
  await en('caja', () => api.hidratarDesdeRemoto());
  const relojAntes = servidor.reloj;

  await en('caja', async () => { guardarPedidos([{ id: 'p1', total: 10 }]); });
  await en('caja', () => api.vaciarColaSync());
  assert.equal(servidor.reloj - relojAntes, 2, 'un cambio y una baja, nada más');

  await en('tablet', () => api.hidratarDesdeRemoto());
  assert.deepEqual(leer('tablet', pedidos), [{ id: 'p1', total: 10 }]);
});

test('el primer dispositivo actualizado migra los documentos del sistema anterior', async () => {
  servidor.documentos = [{ local_id: 'local-1', clave: pedidos, payload: [{ id: 'viejo', total: 5 }] }];
  await en('caja', () => api.hidratarDesdeRemoto());
  assert.deepEqual(leer('caja', pedidos), [{ id: 'viejo', total: 5 }]);
  assert.ok(servidor.filas.has(`${pedidos}|#viejo`));
});

test('si el servidor rechaza un cambio por permisos, el dato local vuelve a lo del servidor', async () => {
  await en('caja', async () => { api.writeStore('restaurant-pagos', [{ id: 'pg1', monto: 10 }], 'restaurant-pagos-updated'); });
  await en('caja', () => api.vaciarColaSync());

  servidor.permiso = fila => fila.clave !== 'restaurant-pagos';
  await en('caja', async () => { api.writeStore('restaurant-pagos', [{ id: 'pg1', monto: 999 }], 'restaurant-pagos-updated'); });
  await en('caja', () => api.vaciarColaSync());

  assert.deepEqual(leer('caja', 'restaurant-pagos'), [{ id: 'pg1', monto: 10 }]);
  assert.match(api.loadEstadoSync().error, /permiso/);
  assert.deepEqual(api.loadColaSync(), []);
});
