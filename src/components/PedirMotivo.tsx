import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

type Props = {
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  placeholder?: string;
  error?: string;
  onCerrar: () => void;
  onConfirmar: (motivo: string, cantidad: number) => void;
  /** Si es más de 1, deja elegir cuántas unidades (anular 1 de 2, por ejemplo). */
  cantidadMaxima?: number;
};

/** Para lo que tiene que quedar explicado: anular un producto, devolver un cobro. */
export default function PedirMotivo({ titulo, descripcion, textoConfirmar, placeholder, error, onCerrar, onConfirmar, cantidadMaxima = 1 }: Props) {
  const [motivo, setMotivo] = useState('');
  const [cantidad, setCantidad] = useState(1);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-sm rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (motivo.trim()) onConfirmar(motivo.trim(), cantidad); }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="font-bold text-slate-800">{titulo}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="space-y-3 p-5">
          {cantidadMaxima > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">¿Cuántos?</span>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Uno menos" onClick={() => setCantidad(c => Math.max(1, c - 1))} disabled={cantidad <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  <Minus size={14} />
                </button>
                <span className="w-16 text-center text-sm font-bold text-slate-800">{cantidad} de {cantidadMaxima}</span>
                <button type="button" aria-label="Uno más" onClick={() => setCantidad(c => Math.min(cantidadMaxima, c + 1))} disabled={cantidad >= cantidadMaxima}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
          <textarea
            autoFocus
            aria-label="Motivo"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={placeholder || 'Motivo'}
            className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onCerrar} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Volver</button>
          <button type="submit" disabled={!motivo.trim()} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">{textoConfirmar}</button>
        </div>
      </form>
    </div>
  );
}
