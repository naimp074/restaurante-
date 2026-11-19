import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUsuarios } from '../lib/usuariosStore';
import { resolverLocalId, verificarConServidor } from '../lib/sync/cliente';
import { documentoPorClave } from '../lib/sync/documentos';
import { agruparBorrados, describirBorrado, hora, nombreClave, type FilaBorrada, type Grupo } from '../lib/historialBorrados';

const maximoFilas = 2000;

/**
 * Todo lo que se borró, quién lo borró y cuándo. El servidor sella el autor y la hora de cada cambio
 * (no se puede falsear desde un equipo) y, desde el 19/11/2026, guarda el contenido de lo borrado:
 * con eso se puede volver a poner.
 */
export default function HistorialBorrados() {
  const usuarios = useUsuarios();
  const [filas, setFilas] = useState<FilaBorrada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtroQuien, setFiltroQuien] = useState('');
  const [filtroClave, setFiltroClave] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    try {
      const localId = await resolverLocalId();
      const { data, error: errorLectura } = await supabase
        .from('sync_registros')
        .select('clave, registro_id, payload, updated_at, updated_by')
        .eq('local_id', localId)
        .eq('eliminado', true)
        .order('updated_at', { ascending: false })
        .limit(maximoFilas);
      if (errorLectura) throw new Error(errorLectura.message);
      setFilas((data || []) as FilaBorrada[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el historial.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const nombreDe = useCallback((id: string | null) => {
    if (!id) return 'Desconocido';
    const usuario = usuarios.find(u => u.id === id);
    return usuario ? `${usuario.nombre} ${usuario.apellido || ''}`.trim() : `Usuario ${id.slice(0, 8)}`;
  }, [usuarios]);

  const visibles = useMemo(() => filas.filter(f =>
    (!filtroQuien || f.updated_by === filtroQuien) && (!filtroClave || f.clave === filtroClave)), [filas, filtroQuien, filtroClave]);
  const grupos = useMemo(() => agruparBorrados(visibles), [visibles]);
  const quienes = useMemo(() => [...new Set(filas.map(f => f.updated_by).filter(Boolean))] as string[], [filas]);
  const claves = useMemo(() => [...new Set(filas.map(f => f.clave))], [filas]);

  const restaurar = async (grupo: Grupo) => {
    if (!supabase) return;
    const conDatos = grupo.filas.filter(f => f.payload && documentoPorClave(f.clave));
    if (!conDatos.length) return;
    const sinDatos = grupo.filas.length - conDatos.length;
    const texto = `¿Volver a poner ${conDatos.length} ${conDatos.length === 1 ? 'registro' : 'registros'} de ${nombreClave(grupo.clave)} en todos los equipos?`
      + (sinDatos ? ` ${sinDatos} no se pueden volver a poner porque se borraron antes de que se guardara su contenido.` : '');
    if (!window.confirm(texto)) return;
    setRestaurando(grupo.id);
    setAviso('');
    setError('');
    try {
      const localId = await resolverLocalId();
      for (let i = 0; i < conDatos.length; i += 200) {
        const { error: errorSubida } = await supabase.from('sync_registros').upsert(
          conDatos.slice(i, i + 200).map(f => ({ local_id: localId, clave: f.clave, registro_id: f.registro_id, payload: f.payload, eliminado: false })),
          { onConflict: 'local_id,clave,registro_id' },
        );
        if (errorSubida) throw new Error(errorSubida.message);
      }
      await verificarConServidor();
      setAviso(`Listo: se volvieron a poner ${conDatos.length} ${conDatos.length === 1 ? 'registro' : 'registros'} de ${nombreClave(grupo.clave)}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo volver a poner.');
    } finally {
      setRestaurando(null);
    }
  };

  const campo = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <History size={18} className="text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Historial de borrados</h3>
        </div>
        <button onClick={() => void cargar()} disabled={cargando} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Todo lo que se borró en cualquier equipo: qué era, quién lo borró y cuándo. Lo anota el servidor, así que no se puede
        cambiar desde un equipo. Lo borrado desde el 19/11/2026 se puede volver a poner.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroQuien} onChange={e => setFiltroQuien(e.target.value)} className={campo} aria-label="Quién borró">
          <option value="">Todas las personas</option>
          {quienes.map(id => <option key={id} value={id}>{nombreDe(id)}</option>)}
        </select>
        <select value={filtroClave} onChange={e => setFiltroClave(e.target.value)} className={campo} aria-label="Qué se borró">
          <option value="">Todo</option>
          {claves.map(clave => <option key={clave} value={clave}>{nombreClave(clave)}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {aviso && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{aviso}</p>}

      {!cargando && !grupos.length && !error && <p className="text-sm text-slate-400">No hay borrados.</p>}

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
        {grupos.map(grupo => {
          const masivo = grupo.filas.length > 5;
          const conDatos = grupo.filas.filter(f => f.payload).length;
          return (
            <div key={grupo.id} className={masivo ? 'bg-red-50/40' : ''}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <button onClick={() => setAbierto(abierto === grupo.id ? null : grupo.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-800">
                    {nombreDe(grupo.quien)} borró {grupo.filas.length === 1 ? describirBorrado(grupo.filas[0]) : `${grupo.filas.length} registros`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {nombreClave(grupo.clave)} · {hora(grupo.cuando)}{masivo ? ' · borrado masivo' : ''}
                    {grupo.filas.length > 1 ? ' · tocá para ver el detalle' : ''}
                  </p>
                </button>
                {conDatos > 0 && documentoPorClave(grupo.clave) && (
                  <button
                    onClick={() => void restaurar(grupo)}
                    disabled={restaurando !== null}
                    className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
                  >
                    <RotateCcw size={14} /> {restaurando === grupo.id ? 'Poniendo…' : 'Volver a poner'}
                  </button>
                )}
              </div>
              {abierto === grupo.id && grupo.filas.length > 1 && (
                <ul className="px-6 pb-3 space-y-0.5 text-xs text-slate-600 max-h-64 overflow-y-auto">
                  {grupo.filas.map(f => <li key={f.registro_id}>{describirBorrado(f)}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {filas.length >= maximoFilas && <p className="text-xs text-slate-400 mt-2">Se muestran los últimos {maximoFilas} borrados.</p>}
    </div>
  );
}
