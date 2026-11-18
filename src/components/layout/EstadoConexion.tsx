import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useEstadoSync } from '../../lib/sync/useEstadoSync';
import { resincronizarTodo } from '../../lib/sync/cliente';
import { textoVersion, useVersionNueva, versionActual } from '../../lib/versionApp';

type Tono = 'verde' | 'amarillo' | 'gris' | 'rojo';

const colores: Record<Tono, { punto: string; texto: string; caja: string }> = {
  verde: { punto: 'bg-emerald-500', texto: 'text-emerald-700', caja: 'border-transparent' },
  amarillo: { punto: 'bg-amber-500 animate-pulse', texto: 'text-amber-800', caja: 'bg-amber-50 border-amber-200' },
  gris: { punto: 'bg-slate-400 animate-pulse', texto: 'text-slate-600', caja: 'bg-slate-50 border-slate-200' },
  rojo: { punto: 'bg-red-500', texto: 'text-red-700', caja: 'bg-red-50 border-red-200' },
};

const haceCuanto = (iso: string, ahora: number) => {
  if (!iso) return 'todavía no';
  const segundos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.round(segundos / 60);
  return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.round(minutos / 60)} h`;
};

/**
 * Cómo está conectado este equipo con los demás. Se ve también en el celular (antes estos avisos
 * solo aparecían en pantallas grandes, y un celular desconectado no se daba cuenta). Tocándolo se ve
 * el detalle, la versión del sistema y "Volver a bajar todo" para un equipo que quedó distinto.
 */
export default function EstadoConexion() {
  const sync = useEstadoSync();
  const versionNueva = useVersionNueva();
  const [abierto, setAbierto] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [resultado, setResultado] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    const fuera = (e: MouseEvent) => { if (panel.current && !panel.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => { window.clearInterval(id); document.removeEventListener('mousedown', fuera); };
  }, [abierto]);

  const [tono, texto, detalle]: [Tono, string, string] = !sync.online
    ? ['amarillo', 'Sin conexión', 'No hay internet. Lo que hagas se guarda acá y se sube solo cuando vuelva.']
    : sync.error
      ? ['rojo', 'Error al sincronizar', sync.error]
      : sync.pendiente > 0
        ? ['gris', 'Sincronizando…', 'Subiendo lo que se hizo en este equipo.']
        : !sync.enVivo
          ? ['amarillo', 'Reconectando…', 'Se cortó la conexión en vivo con los otros equipos. Se reconecta sola; mientras tanto se revisa cada 3 segundos.']
          : ['verde', 'En vivo', 'Conectado en vivo: lo que hacen los otros equipos aparece al instante.'];
  const c = colores[tono];

  const bajarTodo = async () => {
    setBajando(true);
    setResultado('');
    try {
      await resincronizarTodo();
      setResultado('Listo: este equipo quedó igual que el servidor.');
    } catch (e) {
      setResultado(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.');
    }
    setBajando(false);
  };

  return (
    <div className="relative flex items-center gap-2" ref={panel}>
      {versionNueva && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
          title="Se publicó una versión nueva del sistema. Lo que esté sin subir no se pierde."
        >
          <RefreshCw size={13} /><span className="hidden sm:inline">Versión nueva · </span>Actualizar
        </button>
      )}
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        aria-label={`Conexión: ${texto}`}
        className={`flex items-center gap-1.5 text-xs font-medium rounded-lg border px-2 py-2 sm:py-1.5 ${c.texto} ${c.caja}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.punto}`} />
        {/* En el celular, solo el punto: no le saca lugar al título. Tocándolo se ve el detalle. */}
        <span className="hidden sm:inline max-w-[9rem] truncate">{texto}</span>
      </button>

      {abierto && (
        <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className={`flex items-center gap-2 text-sm font-semibold ${c.texto}`}><span className={`h-2.5 w-2.5 rounded-full ${c.punto}`} />{texto}</p>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-slate-400"><X size={16} /></button>
          </div>
          <p className="text-xs text-slate-600">{detalle}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-500">Datos al día</dt><dd className="text-slate-800 text-right">{haceCuanto(sync.ultimaRevision, ahora)}</dd>
            <dt className="text-slate-500">Sin subir</dt><dd className="text-slate-800 text-right">{sync.pendiente ? `${sync.pendiente} tipo(s) de dato` : 'nada'}</dd>
            <dt className="text-slate-500">Versión</dt><dd className="text-slate-800 text-right">{textoVersion(versionActual)}{versionNueva ? ' (hay una nueva)' : ''}</dd>
          </dl>
          <p className="text-[11px] text-slate-500">Si este equipo muestra algo distinto que los demás, compará la versión y tocá:</p>
          <button
            type="button"
            onClick={() => void bajarTodo()}
            disabled={bajando || !sync.online}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
          >
            <RefreshCw size={15} className={bajando ? 'animate-spin' : ''} />{bajando ? 'Bajando…' : 'Volver a bajar todo'}
          </button>
          {resultado && <p className="text-xs text-slate-700">{resultado}</p>}
        </div>
      )}
    </div>
  );
}
