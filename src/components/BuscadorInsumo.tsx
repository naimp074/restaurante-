import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import type { Ingrediente } from '../lib/types';

const normalizar = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const filtrarIngredientes = (ingredientes: Ingrediente[], texto: string) => {
  const busqueda = normalizar(texto);
  if (!busqueda) return ingredientes;
  return ingredientes
    .map(ingrediente => {
      const nombre = normalizar(ingrediente.nombre);
      if (nombre.startsWith(busqueda)) return { ingrediente, orden: 0 };
      if (nombre.includes(busqueda)) return { ingrediente, orden: 1 };
      const palabras = busqueda.split(/\s+/).filter(Boolean);
      if (palabras.length > 1 && palabras.every(palabra => nombre.includes(palabra))) {
        return { ingrediente, orden: 2 };
      }
      return null;
    })
    .filter((item): item is { ingrediente: Ingrediente; orden: number } => item !== null)
    .sort((a, b) => a.orden - b.orden)
    .map(item => item.ingrediente);
};

interface BuscadorInsumoProps {
  ingredientes: Ingrediente[];
  ingredienteId?: string;
  modoNuevo: boolean;
  nombreLeido?: string;
  onSeleccionar: (ingrediente: Ingrediente) => void;
  onCrearNuevo: (nombreSugerido: string) => void;
  permitirCrear?: boolean;
  className?: string;
}

export default function BuscadorInsumo({
  ingredientes,
  ingredienteId,
  modoNuevo,
  nombreLeido,
  onSeleccionar,
  onCrearNuevo,
  permitirCrear = true,
  className = '',
}: BuscadorInsumoProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const [posicion, setPosicion] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const seleccionado = ingredientes.find(item => item.id === ingredienteId);
  const filtrados = filtrarIngredientes(ingredientes, busqueda);

  const abrir = () => {
    // Si todavía no eligió nada, arranca buscando por el nombre que vino del comprobante.
    setBusqueda(!seleccionado && !modoNuevo && nombreLeido ? nombreLeido : '');
    setResaltado(0);
    setAbierto(true);
  };

  useLayoutEffect(() => {
    if (!abierto) return;

    const reposicionar = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ancho = Math.max(rect.width, 300);
      const margen = 8;
      const espacioAbajo = window.innerHeight - rect.bottom - margen;
      const espacioArriba = rect.top - margen;
      const haciaArriba = espacioAbajo < 220 && espacioArriba > espacioAbajo;
      const maxHeight = Math.min(340, haciaArriba ? espacioArriba : espacioAbajo);
      setPosicion({
        top: haciaArriba ? rect.top - maxHeight - 4 : rect.bottom + 4,
        left: Math.max(margen, Math.min(rect.left, window.innerWidth - ancho - margen)),
        width: ancho,
        maxHeight,
      });
    };

    reposicionar();
    inputRef.current?.focus();
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => {
      window.removeEventListener('resize', reposicionar);
      window.removeEventListener('scroll', reposicionar, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;

    const alClickear = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setAbierto(false);
    };

    document.addEventListener('mousedown', alClickear);
    return () => document.removeEventListener('mousedown', alClickear);
  }, [abierto]);

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${resaltado}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [resaltado]);

  const elegir = (ingrediente: Ingrediente) => {
    onSeleccionar(ingrediente);
    setAbierto(false);
  };

  const crear = () => {
    if (!permitirCrear) return;
    onCrearNuevo(busqueda.trim());
    setAbierto(false);
  };

  const alTeclear = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setResaltado(prev => Math.min(prev + 1, filtrados.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setResaltado(prev => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opcion = filtrados[resaltado];
      if (opcion) elegir(opcion);
      else crear();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setAbierto(false);
    }
  };

  const etiqueta = modoNuevo ? 'Crear insumo nuevo' : seleccionado?.nombre || 'Elegir insumo...';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={`flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-sm text-left bg-white transition-colors ${
          abierto ? 'border-amber-400' : 'border-slate-200 hover:border-slate-300'
        } ${className}`}
      >
        <span className={`truncate ${modoNuevo ? 'text-amber-700 font-medium' : seleccionado ? 'text-slate-800' : 'text-slate-400'}`}>
          {etiqueta}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {abierto && createPortal(
        <div
          ref={panelRef}
          style={{ top: posicion.top, left: posicion.left, width: posicion.width, maxHeight: posicion.maxHeight }}
          className="fixed z-[80] flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={e => {
                setBusqueda(e.target.value);
                setResaltado(0);
              }}
              onKeyDown={alTeclear}
              placeholder="Buscar insumo..."
              className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setResaltado(0);
                  inputRef.current?.focus();
                }}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Limpiar
              </button>
            )}
          </div>

          <div ref={listaRef} className="flex-1 overflow-y-auto">
            {filtrados.map((ingrediente, indice) => (
              <button
                key={ingrediente.id}
                type="button"
                data-indice={indice}
                onMouseEnter={() => setResaltado(indice)}
                onClick={() => elegir(ingrediente)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  indice === resaltado ? 'bg-amber-50' : 'bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate">{ingrediente.nombre}</p>
                  <p className="text-[11px] text-slate-400">
                    Stock {ingrediente.stock_actual.toLocaleString()} {ingrediente.unidad_medida}
                  </p>
                </div>
                {ingrediente.id === ingredienteId && <Check size={14} className="text-emerald-600 shrink-0" />}
              </button>
            ))}
            {filtrados.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                No hay insumos que coincidan con "{busqueda}".
              </p>
            )}
          </div>

          {permitirCrear && (
            <button
              type="button"
              onClick={crear}
              className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">
                {busqueda.trim() ? `Crear insumo nuevo "${busqueda.trim()}"` : 'Crear insumo nuevo'}
              </span>
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
