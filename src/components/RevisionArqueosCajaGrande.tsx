import { useState } from 'react';
import { Undo2, Scale } from 'lucide-react';
import type { MovimientoFinanciero } from '../lib/types';
import { ajustarCajaGrandeAlConteo, deshacerCorreccionArqueos, totalCorreccionArqueos } from '../lib/correccionCajaGrande';

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const conSigno = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`;

interface Props {
  saldo: number;
  movimientos: MovimientoFinanciero[];
  creadoPor?: string;
  onCambio: () => void;
}

/**
 * Herramientas de la Caja grande para el admin: deshacer la corrección por arqueos (sumó días dos veces)
 * y dejar el saldo en lo que se contó en la caja fuerte.
 */
export function RevisionArqueosCajaGrande({ saldo, movimientos, creadoPor, onCambio }: Props) {
  const correccion = totalCorreccionArqueos(movimientos);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
  const [contado, setContado] = useState('');
  const [confirmarConteo, setConfirmarConteo] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const contadoNum = contado.trim() === '' ? null : Number(contado);
  const diferenciaConteo = contadoNum === null || !Number.isFinite(contadoNum) ? null : Math.round((contadoNum - saldo) * 100) / 100;

  const ejecutar = (accion: () => string) => {
    try {
      setMensaje(accion());
      setError('');
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setMensaje('');
    }
  };

  const deshacer = () => {
    if (!confirmarDeshacer) { setConfirmarDeshacer(true); return; }
    setConfirmarDeshacer(false);
    ejecutar(() => `Listo: se sacó la corrección por arqueos (${conSigno(-deshacerCorreccionArqueos())}).`);
  };

  const ajustar = () => {
    if (diferenciaConteo === null) { setError('Ingresá lo que contaste en la caja fuerte.'); return; }
    if (!confirmarConteo) { setConfirmarConteo(true); return; }
    setConfirmarConteo(false);
    ejecutar(() => {
      const aplicado = ajustarCajaGrandeAlConteo(contadoNum as number, creadoPor);
      setContado('');
      return aplicado === 0 ? 'Coincide: no hubo que ajustar nada.' : `Listo: la Caja grande quedó en ${formatMoney(contadoNum as number)} (${conSigno(aplicado)}).`;
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      {correccion.cantidad > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Undo2 size={18} className="text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Deshacer la corrección por arqueos</p>
              <p className="text-sm text-amber-800">
                Esa corrección sumó días que ya habían entrado a la Caja grande. Al deshacerla se borran sus {correccion.cantidad} ajustes
                y la Caja grande baja {formatMoney(correccion.total)}, quedando como estaba antes.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {confirmarDeshacer && (
              <button type="button" onClick={() => setConfirmarDeshacer(false)} className="flex-1 py-2.5 border border-amber-200 bg-white rounded-xl text-slate-600 text-sm font-medium">
                Cancelar
              </button>
            )}
            <button type="button" onClick={deshacer} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold">
              {confirmarDeshacer ? `Confirmar: bajar ${formatMoney(correccion.total)}` : 'Deshacer la corrección'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl border bg-blue-50 text-blue-600 border-blue-100 flex items-center justify-center shrink-0">
          <Scale size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Ajustar al conteo de la caja fuerte</h3>
          <p className="text-sm text-slate-500">
            Contá la plata que hay en la caja fuerte y anotala. La Caja grande queda en ese número y la diferencia se guarda como ajuste.
            De acá en adelante cada cierre suma solo lo contado en el cajón.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lo que hay en la caja fuerte</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={contado}
          onChange={e => { setContado(e.target.value); setConfirmarConteo(false); setError(''); }}
          placeholder={String(saldo)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
        />
        {diferenciaConteo !== null && (
          <p className="text-xs text-slate-500 mt-1.5">
            El sistema dice {formatMoney(saldo)}. Diferencia: <span className="font-semibold">{conSigno(diferenciaConteo)}</span>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
      {mensaje && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{mensaje}</p>}

      <div className="flex gap-2">
        {confirmarConteo && (
          <button type="button" onClick={() => setConfirmarConteo(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancelar
          </button>
        )}
        <button type="button" onClick={ajustar} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold">
          {confirmarConteo && diferenciaConteo !== null ? `Confirmar: dejar en ${formatMoney(contadoNum as number)} (${conSigno(diferenciaConteo)})` : 'Ajustar la Caja grande'}
        </button>
      </div>
    </div>
  );
}
