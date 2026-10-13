import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, UserCheck, UserX } from 'lucide-react';
import type { Rol } from '../lib/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Cuenta = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  activo: boolean;
  local_id: string | null;
  created_at: string;
};

const roles: { id: Rol; label: string }[] = [
  { id: 'admin', label: 'Administrador' },
  { id: 'encargado', label: 'Encargado' },
  { id: 'cajero', label: 'Cajero' },
  { id: 'moza', label: 'Moza/Mozo' },
  { id: 'cocina', label: 'Cocina' },
];

/**
 * Cuentas con las que se inicia sesión (Supabase). Las nuevas quedan pendientes hasta
 * que un admin las aprueba: el rol nunca lo elige quien se registra.
 */
export default function CuentasAcceso() {
  const { user } = useAuth();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [rolElegido, setRolElegido] = useState<Record<string, Rol>>({});

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

  const actualizar = async (cuenta: Cuenta, cambios: Partial<Pick<Cuenta, 'rol' | 'activo'>>) => {
    if (!supabase || !user?.local_id) return;
    setError('');
    const { error: fallo } = await supabase
      .from('profiles')
      .update({ ...cambios, local_id: user.local_id, updated_at: new Date().toISOString() })
      .eq('id', cuenta.id);
    if (fallo) setError(fallo.message);
    await cargar();
  };

  const pendientes = cuentas.filter(cuenta => !cuenta.local_id);
  const delLocal = cuentas.filter(cuenta => cuenta.local_id);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-amber-600" />
          <h3 className="font-semibold text-slate-800">Cuentas de acceso</h3>
        </div>
        <button
          onClick={() => void cargar()}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
        </button>
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
                  <p className="text-xs text-slate-500">{cuenta.email}</p>
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
          return (
            <div key={cuenta.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${cuenta.activo ? '' : 'opacity-60'}`}>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium text-slate-800">
                  {cuenta.nombre} {cuenta.apellido} {esYo && <span className="text-xs text-slate-400">(vos)</span>}
                </p>
                <p className="text-xs text-slate-500">{cuenta.email}</p>
              </div>
              <select
                value={cuenta.rol}
                disabled={esYo}
                onChange={e => void actualizar(cuenta, { rol: e.target.value as Rol })}
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
          );
        })}
      </div>
    </div>
  );
}
