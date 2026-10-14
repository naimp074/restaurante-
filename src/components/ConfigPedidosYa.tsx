import { useEffect, useState } from 'react';
import { Copy, ShoppingBag, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cargarConfigPedidosYa, guardarConfigPedidosYa, urlFuncionPedidosYa, type ConfigPedidosYa as Config } from '../lib/pedidosExternos';

/** Datos que pide PedidosYa al dar de alta la integración, y la comisión para calcular lo que liquidan. */
export default function ConfigPedidosYa() {
  const { user } = useAuth();
  const [actual, setActual] = useState<Config | null>(null);
  const [remoteId, setRemoteId] = useState('');
  const [comision, setComision] = useState('');
  const [activo, setActivo] = useState(true);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'guardando' | 'guardado'>('cargando');
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const url = urlFuncionPedidosYa();

  useEffect(() => {
    cargarConfigPedidosYa()
      .then(config => {
        setActual(config);
        setRemoteId(config?.remote_id || '');
        setComision(config ? String(config.comision) : '');
        setActivo(config?.activo ?? true);
        setEstado('listo');
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'No pude leer la configuración.');
        setEstado('listo');
      });
  }, []);

  const guardar = async () => {
    if (!user?.local_id) return;
    setError('');
    setEstado('guardando');
    const nuevo: Config = { remote_id: remoteId.trim(), comision: Math.min(99, Math.max(0, Number(comision) || 0)), activo };
    try {
      await guardarConfigPedidosYa(user.local_id, nuevo, actual?.remote_id);
      setActual(nuevo);
      setEstado('guardado');
      window.setTimeout(() => setEstado('listo'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setEstado('listo');
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles: la dirección queda visible para copiarla a mano.
    }
  };

  const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center">
          <ShoppingBag size={18} className="text-rose-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">PedidosYa</h3>
          <p className="text-xs text-slate-500">Los pedidos entran solos al apartado Pedidos y a la cocina.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección para PedidosYa (Base URL del plugin)</label>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 truncate bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700">{url || 'Falta configurar Supabase'}</code>
            <button onClick={() => void copiar()} disabled={!url} className="px-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50" title="Copiar">
              {copiado ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Código del local (remote ID)</label>
            <input value={remoteId} onChange={e => setRemoteId(e.target.value)} placeholder="Ej: BURGERPOS_CENTRO" className={campo} disabled={estado === 'cargando'} />
            <p className="text-xs text-slate-500 mt-1">El mismo que le informes a PedidosYa para este local.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Comisión de PedidosYa %</label>
            <input value={comision} onChange={e => setComision(e.target.value)} type="number" min="0" max="99" step="0.1" placeholder="Ej: 25" className={campo} disabled={estado === 'cargando'} />
            <p className="text-xs text-slate-500 mt-1">Para calcular cuánto te liquidan de lo pagado en la app.</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="accent-amber-500" />
          Recibir pedidos (desactivalo para pausar la integración sin perder la configuración)
        </label>

        <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
          Para que los productos descuenten stock, el código externo de cada producto en PedidosYa tiene que ser igual al código del producto en BurgerPOS.
          Si no coincide, se busca por nombre.
        </p>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => void guardar()}
          disabled={estado !== 'listo' || !remoteId.trim()}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
        >
          {estado === 'guardado' ? <><Check size={15} />Guardado</> : estado === 'guardando' ? 'Guardando…' : 'Guardar PedidosYa'}
        </button>
      </div>
    </div>
  );
}
