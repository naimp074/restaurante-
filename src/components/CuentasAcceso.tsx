import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Eye, KeyRound, Plus, RefreshCw, UserCheck, UserX, X } from 'lucide-react';
import type { PageId, Profile, Rol } from '../lib/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { paginasPorDefecto, pantallasDelRol } from '../lib/paginas';
import { loadUsuarios, saveUsuarios } from '../lib/usuariosStore';
import { accesoDeCuenta, generarClave, normalizarUsuario, problemasDeCuenta, textoUltimoIngreso, usuarioValido } from '../lib/cuentaUsuario';

type Cuenta = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  activo: boolean;
  local_id: string | null;
  paginas?: PageId[] | null;
  created_at: string;
  /** Vienen de Supabase desde la migración 20261118: con la función vieja quedan sin dato. */
  ultimo_ingreso?: string | null;
  email_confirmado?: boolean | null;
  bloqueada_hasta?: string | null;
};

/** El error que explica la función de usuarios viene en el cuerpo de la respuesta. */
const detalleDeFallo = async (fallo: unknown, porDefecto: string) => {
  const respuesta = (fallo as { context?: Response }).context;
  const detalle = await respuesta?.json?.().catch(() => null) as { error?: string } | null;
  return detalle?.error || porDefecto;
};

/**
 * Le pone una contraseña nueva. La anterior no se puede ver (Supabase guarda solo un resumen
 * cifrado): la nueva se muestra una vez, para pasársela a la persona.
 */
function CambiarClave({ cuenta, onCerrar }: { cuenta: Cuenta; onCerrar: () => void }) {
  const [clave, setClave] = useState(() => generarClave());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [lista, setLista] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const acceso = accesoDeCuenta(cuenta.email);

  const guardar = async () => {
    if (!supabase) return;
    setGuardando(true);
    setError('');
    const { error: fallo } = await supabase.functions.invoke('usuarios/clave', { body: { id: cuenta.id, password: clave } });
    setGuardando(false);
    if (fallo) return setError(await detalleDeFallo(fallo, 'No pude comunicarme con la función de usuarios. ¿Está desplegada la última versión?'));
    setLista(true);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`Usuario: ${acceso}\nContraseña: ${clave}`);
      setCopiada(true);
    } catch { /* sin permiso para copiar: igual se ve en pantalla */ }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={`Contraseña de ${cuenta.nombre}`} className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">Contraseña de {cuenta.nombre} {cuenta.apellido}</h3>
            <p className="text-sm text-slate-500">Entra con: <strong className="text-slate-700">{acceso}</strong></p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>
        {lista ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <p className="text-sm text-emerald-800 flex items-center justify-center gap-1.5"><Check size={15} />Listo. Ya puede entrar con:</p>
              <p className="mt-2 text-sm text-slate-600">Usuario: <strong className="text-slate-900">{acceso}</strong></p>
              <p className="text-sm text-slate-600">Contraseña: <strong className="font-mono text-lg text-slate-900">{clave}</strong></p>
            </div>
            <p className="text-xs text-slate-500">Pasásela ahora: después no se puede volver a ver. Si se la olvida, le ponés otra.</p>
            <div className="flex gap-2">
              <button onClick={() => void copiar()} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50">
                {copiada ? <><Check size={15} />Copiada</> : <><Copy size={15} />Copiar usuario y contraseña</>}
              </button>
              <button onClick={onCerrar} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold">Cerrar</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5">
              La contraseña que tiene ahora no se puede ver: nadie la puede leer, ni el sistema. Lo que sí podés es ponerle una nueva y pasársela.
            </p>
            <div>
              <label htmlFor="clave-nueva" className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña nueva</label>
              <div className="flex gap-2">
                <input
                  id="clave-nueva"
                  type="text"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={clave}
                  onChange={e => { setClave(e.target.value); setError(''); }}
                  className={`${campo} font-mono`}
                />
                <button type="button" onClick={() => { setClave(generarClave()); setError(''); }} className="shrink-0 px-3 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50" title="Inventar otra">
                  <RefreshCw size={15} />
                </button>
              </div>
              <p className={`text-xs mt-1 ${clave.length < 8 ? 'text-red-600' : 'text-slate-500'}`}>Al menos 8 caracteres. Podés escribir una o usar la que se inventa sola.</p>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              onClick={() => void guardar()}
              disabled={guardando || clave.length < 8}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            >
              <KeyRound size={16} />{guardando ? 'Guardando…' : 'Poner esta contraseña'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const roles: { id: Rol; label: string }[] = [
  { id: 'admin', label: 'Administrador' },
  { id: 'encargado', label: 'Encargado' },
  { id: 'cajero', label: 'Cajero' },
  { id: 'moza', label: 'Moza/Mozo' },
  { id: 'cocina', label: 'Cocina' },
];

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400';

function SelectorPantallas({ rol, paginas, onChange }: { rol: Rol; paginas: PageId[]; onChange: (paginas: PageId[]) => void }) {
  if (rol === 'admin') return <p className="text-sm text-slate-500">El administrador puede mirar todas las pantallas.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {pantallasDelRol(rol).map(pantalla => {
        const tildada = pantalla.paginas.some(pagina => paginas.includes(pagina));
        return (
          <label key={pantalla.label} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={tildada}
              onChange={() => onChange(tildada
                ? paginas.filter(pagina => !pantalla.paginas.includes(pagina))
                : [...paginas, ...pantalla.paginas])}
              className="accent-amber-500"
            />
            {pantalla.label}
          </label>
        );
      })}
    </div>
  );
}

// usuarioTocado: mientras no lo edite a mano, el usuario se arma solo con el nombre.
const formularioVacio = { nombre: '', apellido: '', usuario: '', usuarioTocado: false, password: '', rol: 'moza' as Rol, paginas: paginasPorDefecto('moza') };

/** Un usuario ("juan") o, si alguien prefiere, un email. */
const accesoValido = (texto: string) => (texto.includes('@')
  ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim())
  : usuarioValido(normalizarUsuario(texto)));

/**
 * Cuentas con las que se inicia sesión (Supabase). El admin las crea desde acá; las que
 * se registran solas quedan pendientes hasta que las aprueba.
 */
export default function CuentasAcceso() {
  const { user } = useAuth();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [rolElegido, setRolElegido] = useState<Record<string, Rol>>({});
  const [formulario, setFormulario] = useState<typeof formularioVacio | null>(null);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [creando, setCreando] = useState(false);
  const [editandoPantallas, setEditandoPantallas] = useState<{ id: string; paginas: PageId[] } | null>(null);
  const [cambiandoClave, setCambiandoClave] = useState<Cuenta | null>(null);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    const { data, error: fallo } = await supabase.rpc('cuentas_del_local');
    if (fallo) setError(fallo.message);
    else setCuentas((data || []) as Cuenta[]);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const actualizar = async (cuenta: Cuenta, cambios: Partial<Pick<Cuenta, 'rol' | 'activo' | 'paginas'>>) => {
    if (!supabase || !user?.local_id) return false;
    setError('');
    const { error: fallo } = await supabase
      .from('profiles')
      .update({ ...cambios, local_id: user.local_id, updated_at: new Date().toISOString() })
      .eq('id', cuenta.id);
    if (fallo) setError(fallo.message);
    await cargar();
    return !fallo;
  };

  const cambiarRol = (cuenta: Cuenta, rol: Rol) => {
    setEditandoPantallas(null);
    void actualizar(cuenta, { rol, paginas: rol === 'admin' ? null : paginasPorDefecto(rol) });
  };

  const guardarPantallas = async (cuenta: Cuenta) => {
    if (!editandoPantallas?.paginas.length) return;
    if (await actualizar(cuenta, { paginas: editandoPantallas.paginas })) setEditandoPantallas(null);
  };

  const crearCuenta = async () => {
    if (!supabase || !formulario) return;
    setErrorFormulario('');
    setCreando(true);
    const { usuario, nombre, apellido, password, rol, paginas } = formulario;
    const acceso = usuario.includes('@') ? { email: usuario.trim() } : { usuario: normalizarUsuario(usuario) };
    const { data, error: fallo } = await supabase.functions.invoke('usuarios/crear', { body: { ...acceso, nombre, apellido, password, rol, paginas } });
    if (fallo) {
      setErrorFormulario(await detalleDeFallo(fallo, 'No pude comunicarme con la función de usuarios.'));
      setCreando(false);
      return;
    }

    // Así ya se le pueden asignar mesas, sin esperar a que inicie sesión por primera vez.
    const ahora = new Date().toISOString();
    const nuevo: Profile = {
      id: (data as { id: string }).id,
      nombre: formulario.nombre.trim(),
      apellido: formulario.apellido.trim(),
      rol: formulario.rol,
      activo: true,
      local_id: user?.local_id,
      paginas: formulario.rol === 'admin' ? null : formulario.paginas,
      created_at: ahora,
      updated_at: ahora,
    };
    saveUsuarios([...loadUsuarios(), nuevo]);
    setCreando(false);
    setFormulario(null);
    await cargar();
  };

  const pendientes = cuentas.filter(cuenta => !cuenta.local_id);
  const delLocal = cuentas.filter(cuenta => cuenta.local_id);
  const formularioCompleto = formulario
    && formulario.nombre.trim()
    && accesoValido(formulario.usuario)
    && formulario.password.length >= 8
    && (formulario.rol === 'admin' || formulario.paginas.length > 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-amber-600" />
          <h3 className="font-semibold text-slate-800">Cuentas de acceso</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void cargar()}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setErrorFormulario(''); setFormulario(formularioVacio); }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-medium px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} />
            Crear usuario
          </button>
        </div>
      </div>

      {error && <p className="mx-5 mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

      {pendientes.length > 0 && (
        <div className="p-5 border-b border-slate-100 bg-amber-50/40">
          <p className="text-sm font-medium text-slate-700 mb-3">Esperando aprobación</p>
          <div className="space-y-2">
            {pendientes.map(cuenta => (
              <div key={cuenta.id} className="flex flex-wrap items-center gap-3 bg-white border border-amber-100 rounded-xl p-3">
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm font-medium text-slate-800">{cuenta.nombre} {cuenta.apellido}</p>
                  <p className="text-xs text-slate-500">{accesoDeCuenta(cuenta.email)}</p>
                </div>
                <select
                  value={rolElegido[cuenta.id] || 'moza'}
                  onChange={e => setRolElegido(prev => ({ ...prev, [cuenta.id]: e.target.value as Rol }))}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                >
                  {roles.map(rol => <option key={rol.id} value={rol.id}>{rol.label}</option>)}
                </select>
                <button
                  onClick={() => void actualizar(cuenta, { rol: rolElegido[cuenta.id] || 'moza', activo: true })}
                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <UserCheck size={14} />Aprobar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {!delLocal.length && !cargando && (
          <p className="p-5 text-sm text-slate-500">No hay cuentas en este local.</p>
        )}
        {delLocal.map(cuenta => {
          const esYo = cuenta.id === user?.id;
          const editando = editandoPantallas?.id === cuenta.id;
          return (
            <div key={cuenta.id} className={`px-5 py-3 ${cuenta.activo ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm font-medium text-slate-800">
                    {cuenta.nombre} {cuenta.apellido} {esYo && <span className="text-xs text-slate-400">(vos)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Entra con: <span className="font-medium text-slate-600">{accesoDeCuenta(cuenta.email)}</span>
                    {cuenta.ultimo_ingreso !== undefined && <span className={cuenta.ultimo_ingreso ? '' : ' text-amber-700'}> · {textoUltimoIngreso(cuenta.ultimo_ingreso)}</span>}
                  </p>
                </div>
                <button
                  onClick={() => setCambiandoClave(cuenta)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <KeyRound size={13} />
                  Contraseña
                </button>
                {cuenta.rol !== 'admin' && (
                  <button
                    onClick={() => setEditandoPantallas(editando ? null : { id: cuenta.id, paginas: cuenta.paginas || paginasPorDefecto(cuenta.rol) })}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <Eye size={13} />
                    Qué puede mirar
                  </button>
                )}
                <select
                  value={cuenta.rol}
                  disabled={esYo}
                  onChange={e => cambiarRol(cuenta, e.target.value as Rol)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-400 disabled:bg-slate-50"
                >
                  {roles.map(rol => <option key={rol.id} value={rol.id}>{rol.label}</option>)}
                </select>
                <button
                  disabled={esYo}
                  onClick={() => void actualizar(cuenta, { activo: !cuenta.activo })}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${
                    cuenta.activo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {cuenta.activo ? <UserCheck size={13} /> : <UserX size={13} />}
                  {cuenta.activo ? 'Activa' : 'Bloqueada'}
                </button>
              </div>
              {problemasDeCuenta(cuenta).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {problemasDeCuenta(cuenta).map(problema => (
                    <li key={problema} className="flex items-start gap-1.5 text-xs text-amber-800">
                      <AlertTriangle size={13} className="shrink-0 mt-px" />{problema}
                    </li>
                  ))}
                </ul>
              )}
              {editando && editandoPantallas && (
                <div className="mt-3 rounded-xl bg-slate-50 p-4 space-y-3">
                  <SelectorPantallas
                    rol={cuenta.rol}
                    paginas={editandoPantallas.paginas}
                    onChange={paginas => setEditandoPantallas({ id: cuenta.id, paginas })}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void guardarPantallas(cuenta)}
                      disabled={!editandoPantallas.paginas.length}
                      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Guardar
                    </button>
                    <p className="text-xs text-slate-500">Se aplica la próxima vez que abra el sistema.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cambiandoClave && <CambiarClave cuenta={cambiandoClave} onCerrar={() => { setCambiandoClave(null); void cargar(); }} />}

      {formulario && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Crear usuario</h3>
              <button onClick={() => setFormulario(null)} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cuenta-nombre" className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                  <input id="cuenta-nombre" value={formulario.nombre} onChange={e => setFormulario({ ...formulario, nombre: e.target.value, usuario: formulario.usuarioTocado ? formulario.usuario : normalizarUsuario(e.target.value) })} className={campo} />
                </div>
                <div>
                  <label htmlFor="cuenta-apellido" className="block text-sm font-medium text-slate-700 mb-1.5">Apellido</label>
                  <input id="cuenta-apellido" value={formulario.apellido} onChange={e => setFormulario({ ...formulario, apellido: e.target.value })} className={campo} />
                </div>
              </div>
              <div>
                <label htmlFor="cuenta-usuario" className="block text-sm font-medium text-slate-700 mb-1.5">Usuario para entrar *</label>
                <input
                  id="cuenta-usuario"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={formulario.usuario}
                  onChange={e => setFormulario({ ...formulario, usuario: e.target.value, usuarioTocado: true })}
                  className={campo}
                  placeholder="Ej: juan"
                />
                {formulario.usuario.trim() && !accesoValido(formulario.usuario) ? (
                  <p className="text-xs text-red-600 mt-1">De 3 a 30 letras o números, sin espacios raros (puede llevar punto o guion).</p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">
                    No hace falta email. {formulario.usuario.trim() && !formulario.usuario.includes('@')
                      ? <>Va a entrar escribiendo <strong>{normalizarUsuario(formulario.usuario)}</strong> y la contraseña.</>
                      : 'Si preferís, también podés poner un email.'}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="cuenta-password" className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña *</label>
                <input id="cuenta-password" type="text" autoComplete="new-password" value={formulario.password} onChange={e => setFormulario({ ...formulario, password: e.target.value })} className={campo} placeholder="Al menos 8 caracteres" />
              </div>
              <div>
                <label htmlFor="cuenta-rol" className="block text-sm font-medium text-slate-700 mb-1.5">Rol</label>
                <select
                  id="cuenta-rol"
                  value={formulario.rol}
                  onChange={e => {
                    const rol = e.target.value as Rol;
                    setFormulario({ ...formulario, rol, paginas: paginasPorDefecto(rol) });
                  }}
                  className={`${campo} bg-white`}
                >
                  {roles.map(rol => <option key={rol.id} value={rol.id}>{rol.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Qué puede mirar</p>
                <SelectorPantallas rol={formulario.rol} paginas={formulario.paginas} onChange={paginas => setFormulario({ ...formulario, paginas })} />
              </div>
              {errorFormulario && <p role="alert" className="text-sm text-red-600">{errorFormulario}</p>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setFormulario(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button
                onClick={() => void crearCuenta()}
                disabled={!formularioCompleto || creando}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
              >
                {creando ? 'Creando…' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
