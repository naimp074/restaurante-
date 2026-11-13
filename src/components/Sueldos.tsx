import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileText, Wallet, X } from 'lucide-react';
import type { Gasto, Profile } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useGastos } from '../lib/gastosStore';
import { useUsuarios } from '../lib/usuariosStore';
import { cuentaCajaDiaId, cuentaCajaGrandeId, cuentaBancoId, loadCuentasDinero } from '../lib/finance';
import { dayKey } from '../lib/fechas';
import { estadoDeCuenta, nombrePeriodo,nombreUsuario, pagarSueldo, pagosDeSueldo, periodoActual, type EstadoSueldo } from '../lib/sueldos';

const dinero = (valor: number) => `$${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white';

const estadosSueldo: Record<EstadoSueldo, { label: string; color: string }> = {
  pagado: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-700' },
  parcial: { label: 'Pago parcial', color: 'bg-amber-100 text-amber-700' },
  sin_pagar: { label: 'Sin pagar', color: 'bg-red-100 text-red-700' },
  sin_sueldo: { label: 'Sin sueldo cargado', color: 'bg-slate-100 text-slate-500' },
};

const Iniciales = ({ usuario }: { usuario: Profile }) => (
  <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
    {usuario.nombre[0]}{usuario.apellido?.[0] || ''}
  </div>
);

/** "2026-11-12" → "12/11/2026". */
const fechaCorta = (fecha: string) => fecha.split('-').reverse().join('/');

/** Lo que ya se le pagó a la persona en un día. */
const pagadoEnElDia = (gastos: Gasto[], empleadoId: string, fecha: string) =>
  pagosDeSueldo(gastos, empleadoId).filter(g => g.fecha === fecha).reduce((suma, g) => suma + g.monto, 0);

/** Pago rápido por día: elegís a quién, cuánto y la fecha. */
export function PagarSueldo({ usuarioInicial, fechaInicial, onCerrar }: { usuarioInicial?: string; periodoInicial?: string; fechaInicial?: string; onCerrar: () => void }) {
  const { user } = useAuth();
  const usuarios = useUsuarios().filter(u => u.activo || u.id === usuarioInicial);
  const gastos = useGastos();
  const cuentas = loadCuentasDinero().filter(c => c.activa);
  const [usuarioId, setUsuarioId] = useState(usuarioInicial || '');
  const usuario = usuarios.find(u => u.id === usuarioId);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(fechaInicial || dayKey());
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [desdeCajaDia, setDesdeCajaDia] = useState(false);
  const [cuentaId, setCuentaId] = useState(cuentaCajaGrandeId);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');

  const elegir = (id: string) => {
    setUsuarioId(id);
    setError('');
  };

  const cambiarMetodo = (nuevo: 'efectivo' | 'transferencia') => {
    setMetodo(nuevo);
    setCuentaId(nuevo === 'efectivo' ? cuentaCajaGrandeId : cuentaBancoId);
    if (nuevo === 'transferencia') setDesdeCajaDia(false);
  };

  const confirmar = () => {
    if (!usuario) return setError('Elegí a quién le pagás.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError('Elegí la fecha del pago.');
    try {
      pagarSueldo({
        usuario,
        // Se paga por día: el mes sale de la fecha, solo para agrupar el historial.
        periodo: fecha.slice(0, 7),
        concepto: `Sueldo ${nombreUsuario(usuario)} · ${fechaCorta(fecha)}`,
        monto: Number(monto),
        fecha,
        metodo_pago: metodo,
        cuenta_id: cuentaId,
        desde_caja_dia: desdeCajaDia,
        cuenta_caja_dia_id: cuentaCajaDiaId,
        observaciones,
        creado_por: user ? nombreUsuario(user) : undefined,
      });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    }
  };

  const montoNum = Number(monto) || 0;
  const cuentasMetodo = cuentas.filter(c => c.id !== cuentaCajaDiaId && (metodo === 'efectivo' ? c.tipo === 'efectivo' : c.tipo !== 'efectivo'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">Pagar sueldo</h3>
            <p className="text-sm text-slate-500">Queda en Pagos y en el estado de cuenta de la persona.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">¿A quién le pagás?</p>
            {usuarios.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">Primero cargá tu personal en la pantalla Usuarios.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                {usuarios.map(u => {
                  const cobroHoy = pagadoEnElDia(gastos, u.id, fecha);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={u.id === usuarioId}
                      onClick={() => elegir(u.id)}
                      className={`flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left transition-colors ${
                        u.id === usuarioId ? 'border-amber-400 bg-amber-50' : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <Iniciales usuario={u} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{nombreUsuario(u)}</p>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${cobroHoy > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {cobroHoy > 0 ? `Cobró ${dinero(cobroHoy)} ese día` : 'Sin pago ese día'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sueldo-monto" className="block text-sm font-medium text-slate-700 mb-1.5">Monto a pagar *</label>
              <input id="sueldo-monto" type="number" min="0" value={monto} onChange={e => { setMonto(e.target.value); setError(''); }} placeholder="0" className={`${campo} font-semibold`} />
            </div>
            <div>
              <label htmlFor="sueldo-fecha" className="block text-sm font-medium text-slate-700 mb-1.5">Fecha</label>
              <input id="sueldo-fecha" type="date" value={fecha} onChange={e => { setFecha(e.target.value); setError(''); }} className={campo} />
            </div>
          </div>
          {usuario && pagadoEnElDia(gastos, usuario.id, fecha) > 0 && (
            <p className="text-xs text-amber-700">
              {usuario.nombre} ya cobró {dinero(pagadoEnElDia(gastos, usuario.id, fecha))} el {fechaCorta(fecha)}. Si pagás de nuevo, se suma.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(['efectivo', 'transferencia'] as const).map(opcion => (
              <button
                key={opcion}
                type="button"
                onClick={() => cambiarMetodo(opcion)}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium ${metodo === opcion ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-100 text-slate-600'}`}
              >
                {opcion === 'efectivo' ? 'Efectivo' : 'Transferencia'}
              </button>
            ))}
          </div>

          {metodo === 'efectivo' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={desdeCajaDia} onChange={e => setDesdeCajaDia(e.target.checked)} className="accent-amber-500" />
              Sale de la caja del día
            </label>
          )}
          {!(metodo === 'efectivo' && desdeCajaDia) && (
            <div>
              <label htmlFor="sueldo-cuenta" className="block text-sm font-medium text-slate-700 mb-1.5">Sale de</label>
              <select id="sueldo-cuenta" value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={campo}>
                {(cuentasMetodo.length ? cuentasMetodo : cuentas).map(c => <option key={c.id} value={c.id}>{c.nombre} - {dinero(c.saldo)}</option>)}
              </select>
            </div>
          )}

          <input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Nota (ej: adelanto, aguinaldo)" className={campo} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t border-slate-100">
          <button
            onClick={confirmar}
            disabled={!usuario || montoNum <= 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Check size={16} />
            {usuario ? `Pagar ${dinero(montoNum)} a ${usuario.nombre}` : 'Elegí a quién le pagás'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mes por mes: cuánto le correspondía, cuánto se le pagó y cuánto falta. */
export function EstadoCuentaSueldo({ usuarioId, onCerrar, onPagar }: { usuarioId: string; onCerrar: () => void; onPagar: (periodo: string) => void }) {
  const usuario = useUsuarios().find(u => u.id === usuarioId);
  const gastos = useGastos();
  const cuentas = useMemo(() => loadCuentasDinero(), []);
  const [abierto, setAbierto] = useState<string | null>(periodoActual());
  if (!usuario) return null;
  const { meses, totalPagado, totalAdeudado } = estadoDeCuenta(usuario, gastos);
  const nombreCuenta = (id?: string) => cuentas.find(c => c.id === id)?.nombre || 'Cuenta';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Iniciales usuario={usuario} />
            <div>
              <h3 className="font-bold text-slate-800">Estado de cuenta · {nombreUsuario(usuario)}</h3>
              <p className="text-sm text-slate-500">Sueldo mensual: {usuario.sueldo ? dinero(usuario.sueldo) : 'sin cargar'}</p>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 pb-0">
          <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Total cobrado</p><p className="text-lg font-bold text-emerald-800">{dinero(totalPagado)}</p></div>
          <div className={`rounded-xl p-3 ${totalAdeudado > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <p className={`text-xs ${totalAdeudado > 0 ? 'text-red-700' : 'text-slate-500'}`}>Se le debe</p>
            <p className={`text-lg font-bold ${totalAdeudado > 0 ? 'text-red-700' : 'text-slate-700'}`}>{dinero(totalAdeudado)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {meses.map(mes => {
            const cfg = estadosSueldo[mes.estado];
            const expandido = abierto === mes.periodo;
            return (
              <div key={mes.periodo} className="border border-slate-100 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setAbierto(expandido ? null : mes.periodo)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50">
                  {expandido ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                  <span className="flex-1 text-sm font-semibold text-slate-800 capitalize">{nombrePeriodo(mes.periodo)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="w-28 text-right text-sm text-slate-600">{dinero(mes.pagado)} / {dinero(mes.sueldo)}</span>
                </button>
                {expandido && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-3 space-y-2">
                    {mes.pagos.length === 0 ? (
                      <p className="text-xs text-slate-500">No tiene pagos registrados en este mes.</p>
                    ) : mes.pagos.map(pago => (
                      <div key={pago.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-slate-700">{new Date(`${pago.fecha}T00:00:00`).toLocaleDateString('es-AR')} · {pago.metodo_pago === 'transferencia' ? 'Transferencia' : 'Efectivo'} · {nombreCuenta(pago.cuenta_origen_id)}</p>
                          {pago.observaciones && <p className="text-xs text-slate-400">{pago.observaciones}</p>}
                        </div>
                        <span className="font-semibold text-emerald-700 shrink-0">{dinero(pago.monto)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-sm text-slate-600">Le falta cobrar: <strong className={mes.resta > 0 ? 'text-red-600' : 'text-slate-700'}>{dinero(mes.resta)}</strong></span>
                      <button onClick={() => onPagar(mes.periodo)} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                        <Wallet size={13} />Pagar este mes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta de Pagos: cuánto cobró cada persona en el día elegido (se paga por día). */
export function SueldosDelMes() {
  const usuarios = useUsuarios().filter(u => u.activo);
  const gastos = useGastos();
  const [fecha, setFecha] = useState(dayKey());
  const [pagando, setPagando] = useState<{ usuarioId?: string; fecha: string } | null>(null);
  const [cuentaDe, setCuentaDe] = useState<string | null>(null);
  const filas = usuarios.map(u => ({ usuario: u, delDia: pagadoEnElDia(gastos, u.id, fecha) }));
  const totalDia = filas.reduce((s, f) => s + f.delDia, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-800">Sueldos del personal</h3>
          <p className="text-xs text-slate-500">
            Pagado el {fechaCorta(fecha)}: <span className="font-semibold text-slate-700">{dinero(totalDia)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} aria-label="Día" className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
          <button onClick={() => setPagando({ fecha })} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            <Wallet size={14} />Pagar sueldo
          </button>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">Cargá tu personal en Usuarios para pagarle sueldos desde acá.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {filas.map(({ usuario, delDia }) => {
            return (
              <div key={usuario.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                <Iniciales usuario={usuario} />
                <div className="flex-1 min-w-[8rem]">
                  <p className="text-sm font-medium text-slate-800">{nombreUsuario(usuario)}</p>
                  <p className="text-xs text-slate-500">{delDia > 0 ? `Cobró ${dinero(delDia)} ese día` : 'Sin pago ese día'}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${delDia > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {delDia > 0 ? 'Pagado' : 'Sin pagar'}
                </span>
                <button onClick={() => setCuentaDe(usuario.id)} className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                  <FileText size={13} />Estado de cuenta
                </button>
                <button
                  onClick={() => setPagando({ usuarioId: usuario.id, fecha })}
                  className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg"
                >
                  Pagar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {cuentaDe && (
        <EstadoCuentaSueldo
          usuarioId={cuentaDe}
          onCerrar={() => setCuentaDe(null)}
          onPagar={() => setPagando({ usuarioId: cuentaDe, fecha: dayKey() })}
        />
      )}
      {pagando && (
        <PagarSueldo
          key={`${pagando.usuarioId}-${pagando.fecha}`}
          usuarioInicial={pagando.usuarioId}
          fechaInicial={pagando.fecha}
          onCerrar={() => setPagando(null)}
        />
      )}
    </div>
  );
}
