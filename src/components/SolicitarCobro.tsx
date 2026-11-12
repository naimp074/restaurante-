import { useEffect, useState } from 'react';
import { Banknote, Send, X } from 'lucide-react';
import type { MetodoPago, Pedido, RepartoMixto } from '../lib/types';
import { errorReparto, mediosReparto, mediosSolicitud, totalReparto } from '../lib/cobroComanda';
import { etiquetaPedido } from '../lib/pedidosCanal';
import { DetalleItem } from './OpcionesProducto';

type Props = {
  pedido: Pedido;
  enviando: boolean;
  error: string;
  onCerrar: () => void;
  onConfirmar: (metodo: MetodoPago, reparto?: RepartoMixto) => void;
};

const plata = (monto: number) => `$${monto.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

type Montos = Record<keyof RepartoMixto, string>;
const sinMontos: Montos = { efectivo: '', transferencia: '', debito: '', credito: '' };

/** "8.800", "8800,50" o "8800.5" → número. Vacío cuenta como cero. */
const leerMonto = (texto: string) => {
  const t = texto.trim();
  if (!t) return 0;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
};

const escribirMonto = (monto: number) => (monto > 0 ? String(monto).replace('.', ',') : '');

/** La moza pide el cobro: elige el medio y lo manda a caja. No cobra ni cierra la comanda. */
export default function SolicitarCobro({ pedido, enviando, error, onCerrar, onConfirmar }: Props) {
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [montos, setMontos] = useState<Montos>(sinMontos);
  const items = (pedido.items || []).filter(item => item.estado !== 'cancelado');

  const reparto: RepartoMixto = {
    efectivo: leerMonto(montos.efectivo),
    transferencia: leerMonto(montos.transferencia),
    debito: leerMonto(montos.debito),
    credito: leerMonto(montos.credito),
  };
  const esMixto = metodo === 'mixto';
  const problemaMixto = esMixto ? errorReparto(reparto, pedido.total) : null;
  const sumaMixto = totalReparto(reparto);
  const resto = Math.round((pedido.total - sumaMixto) * 100) / 100;
  const puedeEnviar = Boolean(metodo) && !problemaMixto && !enviando;

  /** Pone en ese medio lo que falta para llegar al total. */
  const completarCon = (medio: keyof RepartoMixto) => {
    const sinEste = Math.round((pedido.total - (sumaMixto - reparto[medio])) * 100) / 100;
    setMontos(prev => ({ ...prev, [medio]: escribirMonto(sinEste) }));
  };

  const enviar = () => {
    if (!metodo || !puedeEnviar) return;
    onConfirmar(metodo, esMixto ? reparto : undefined);
  };

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === 'Escape' && !enviando) onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [enviando, onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !enviando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-solicitar-cobro" className="flex max-h-[94vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 id="titulo-solicitar-cobro" className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Banknote size={20} className="text-emerald-600" />Cobrar comanda
            </h3>
            <p className="text-sm text-slate-500">
              {etiquetaPedido(pedido)} · Comanda #{pedido.id.replace(/^ped-/, '').slice(0, 6).toUpperCase()}
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={enviando} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {items.map(item => (
              <li key={item.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-700"><span className="font-semibold">{item.cantidad}×</span> {item.producto?.nombre || 'Producto'}</span>
                  <DetalleItem opciones={item.opciones} observaciones={item.observaciones} />
                </div>
                <span className="shrink-0 font-medium text-slate-800">{plata(item.subtotal)}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{plata(pedido.subtotal)}</span></div>
            {pedido.descuento > 0 && <div className="flex justify-between text-emerald-600"><span>Descuento</span><span>-{plata(pedido.descuento)}</span></div>}
            {pedido.recargo > 0 && <div className="flex justify-between text-orange-600"><span>Recargo</span><span>{plata(pedido.recargo)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold text-slate-800">
              <span>Total a cobrar</span><span className="text-emerald-700">{plata(pedido.total)}</span>
            </div>
            <p className="text-xs text-slate-400">Si el medio de pago tiene descuento o recargo, caja lo aplica al confirmar.</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-700">¿Cómo paga?</legend>
            <div className="grid grid-cols-2 gap-2">
              {mediosSolicitud.map(medio => (
                <button
                  key={medio.id}
                  type="button"
                  aria-pressed={metodo === medio.id}
                  onClick={() => setMetodo(medio.id)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${medio.id === 'mixto' ? 'col-span-2' : ''} ${
                    metodo === medio.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  {medio.label}
                </button>
              ))}
            </div>
          </fieldset>

          {esMixto && (
            <fieldset className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">¿Cuánto paga con cada medio?</legend>
              {mediosReparto.map(medio => (
                <div key={medio.id} className="flex items-center gap-2">
                  <label htmlFor={`mixto-${medio.id}`} className="w-36 shrink-0 text-sm font-medium text-slate-700">{medio.label}</label>
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      id={`mixto-${medio.id}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={montos[medio.id]}
                      onChange={e => setMontos(prev => ({ ...prev, [medio.id]: e.target.value.replace(/[^\d.,]/g, '') }))}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-right text-base font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => completarCon(medio.id)}
                    className="h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                    title="Poner acá lo que falta"
                  >
                    Resto
                  </button>
                </div>
              ))}
              <p
                aria-live="polite"
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  resto === 0 && !problemaMixto ? 'bg-emerald-100 text-emerald-800'
                    : resto < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {resto === 0 && !problemaMixto
                  ? `Cuadra justo: ${plata(sumaMixto)}`
                  : resto === 0 ? problemaMixto
                    : resto > 0 ? `Faltan ${plata(resto)} de ${plata(pedido.total)}`
                      : `Te pasaste ${plata(-resto)} del total`}
              </p>
            </fieldset>
          )}

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onCerrar} disabled={enviando} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Send size={16} />{enviando ? 'Enviando…' : 'Enviar solicitud a Caja'}
          </button>
        </div>
      </div>
    </div>
  );
}
