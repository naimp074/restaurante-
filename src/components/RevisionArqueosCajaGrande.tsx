import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { CajaDiaria, MovimientoFinanciero } from '../lib/types';
import { arqueosConDiferencia, corregirCajaGrandeConArqueos, revisarCajaGrandeConArqueos } from '../lib/correccionCajaGrande';

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const conSigno = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`;

interface Props {
  cajas: CajaDiaria[];
  movimientos: MovimientoFinanciero[];
  creadoPor?: string;
  onCorregido: () => void;
}

/**
 * Compara, caja por caja, el efectivo contado en el arqueo con lo que de verdad entró a la Caja grande
 * y deja corregir la diferencia de una vez.
 */
export function RevisionArqueosCajaGrande({ cajas, movimientos, creadoPor, onCorregido }: Props) {
  const revision = useMemo(() => revisarCajaGrandeConArqueos(cajas, movimientos), [cajas, movimientos]);
  const conDiferencia = arqueosConDiferencia(revision);
  const total = Math.round(conDiferencia.reduce((suma, fila) => suma + fila.diferencia, 0) * 100) / 100;
  const [verTodo, setVerTodo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  if (!revision.length) return null;

  const filas = verTodo ? [...revision].reverse() : [...conDiferencia].reverse();

  const corregir = () => {
    if (!confirmar) { setConfirmar(true); return; }
    try {
      const aplicado = corregirCajaGrandeConArqueos(creadoPor);
      setMensaje(`Listo: la Caja grande se corrigió ${conSigno(aplicado)} con los arqueos.`);
      setError('');
      onCorregido();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo corregir la Caja grande.');
    }
    setConfirmar(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl border bg-blue-50 text-blue-600 border-blue-100 flex items-center justify-center shrink-0">
          <ClipboardCheck size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Revisar con los arqueos</h3>
          <p className="text-sm text-slate-500">
            En cada cierre tenía que entrar a la Caja grande el efectivo contado en el cajón.
            Acá se ve, caja por caja, si entró eso o no.
          </p>
        </div>
      </div>

      {conDiferencia.length === 0 ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          Las {revision.length} cajas cerradas coinciden con lo que se contó.
        </p>
      ) : (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {conDiferencia.length} de {revision.length} cajas no coinciden. En total a la Caja grande le
          {total >= 0 ? ' faltan ' : ' sobran '}<span className="font-bold">{formatMoney(Math.abs(total))}</span>.
        </p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Día</th>
                <th className="text-left font-semibold px-3 py-2">Cerró</th>
                <th className="text-right font-semibold px-3 py-2">Contado</th>
                <th className="text-right font-semibold px-3 py-2">Entró</th>
                <th className="text-right font-semibold px-3 py-2">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map(fila => (
                <tr key={fila.cajaId}>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{fila.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-3 py-2 text-slate-500">{fila.cajero || '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatMoney(fila.contado)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatMoney(fila.entro)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${Math.abs(fila.diferencia) < 1 ? 'text-slate-400' : fila.diferencia > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Math.abs(fila.diferencia) < 1 ? 'OK' : conSigno(fila.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={() => setVerTodo(v => !v)} className="text-sm font-medium text-slate-500 hover:text-slate-800">
        {verTodo ? 'Ver solo las que no coinciden' : `Ver las ${revision.length} cajas`}
      </button>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
      {mensaje && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{mensaje}</p>}

      {conDiferencia.length > 0 && (
        <div className="space-y-2">
          {confirmar && (
            <p className="text-sm text-slate-600">
              La Caja grande va a quedar en {conSigno(total)} respecto de ahora. Queda anotado día por día en los movimientos
              y no se puede aplicar dos veces. Tocá de nuevo para confirmar.
            </p>
          )}
          <div className="flex gap-2">
            {confirmar && (
              <button type="button" onClick={() => setConfirmar(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50">
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={corregir}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold"
            >
              {confirmar ? `Confirmar corrección (${conSigno(total)})` : `Corregir la Caja grande (${conSigno(total)})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
