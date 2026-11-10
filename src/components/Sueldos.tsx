import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileText, Wallet, X } from 'lucide-react';
import type { Profile } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useGastos } from '../lib/gastosStore';
import { loadUsuarios, saveUsuarios, useUsuarios } from '../lib/usuariosStore';
import { cuentaCajaDiaId, cuentaCajaGrandeId, cuentaBancoId, loadCuentasDinero } from '../lib/finance';
import { dayKey } from '../lib/fechas';
import { estadoDeCuenta, mesDeSueldo, nombrePeriodo, nombreUsuario, pagarSueldo, periodoActual, type EstadoSueldo } from '../lib/sueldos';

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

const guardarSueldo = (usuarioId: string, sueldo: number) =>
  saveUsuarios(loadUsuarios().map(u => (u.id === usuarioId ? { ...u, sueldo, updated_at: new Date().toISOString() } : u)));

/** Pago rápido: elegís a quién, el mes, y el monto ya viene con lo que le falta cobrar. */
export function PagarSueldo({ usuarioInicial, periodoInicial, onCerrar }: { usuarioInicial?: string; periodoInicial?: string; onCerrar: () => void }) {
  const { user } = useAuth();
  const usuarios = useUsuarios().filter(u => u.activo || u.id === usuarioInicial);
  const gastos = useGastos();
  const cuentas = loadCuentasDinero().filter(c => c.activa);
  const [usuarioId, setUsuarioId] = useState(usuarioInicial || '');
  const [periodo, setPeriodo] = useState(periodoInicial || periodoActual());
  const usuario = usuarios.find(u => u.id === usuarioId);
  const [sueldo, setSueldo] = useState(usuario?.sueldo ? String(usuario.sueldo) : '');
  const mes = usuario ? mesDeSueldo({ ...usuario, sueldo: Number(sueldo) || 0 }, gastos, periodo) : null;
  const [monto, setMonto] = useState(() => (mes && mes.resta > 0 ? String(mes.resta) : ''));
  const [fecha, setFecha] = useState(dayKey());
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [desdeCajaDia, setDesdeCajaDia] = useState(false);
  const [cuentaId, setCuentaId] = useState(cuentaCajaGrandeId);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');

  // Al cambiar de persona o de mes, el monto se vuelve a completar con lo que falta.
  const elegir = (id: string, nuevoPeriodo = periodo) => {
    const elegido = usuarios.find(u => u.id === id);
    const sueldoElegido = id === usuarioId ? Number(sueldo) || 0 : elegido?.sueldo || 0;
    if (id !== usuarioId) setSueldo(elegido?.sueldo ? String(elegido.sueldo) : '');
    setUsuarioId(id);
    setPeriodo(nuevoPeriodo);
    const resta = elegido ? mesDeSueldo({ ...elegido, sueldo: sueldoElegido }, gastos, nuevoPeriodo).resta : 0;
    setMonto(resta > 0 ? String(resta) : '');
    setError('');
  };

  const cambiarMetodo = (nuevo: 'efectivo' | 'transferencia') => {
    setMetodo(nuevo);
    setCuentaId(nuevo === 'efectivo' ? cuentaCajaGrandeId : cuentaBancoId);
    if (nuevo === 'transferencia') setDesdeCajaDia(false);
  };

  const confirmar = () => {
    if (!usuario) return setError('Elegí a quién le pagás.');
    const sueldoNum = Number(sueldo) || 0;
    if (sueldo && sueldoNum < 0) return setError('Revisá el sueldo mensual.');
    try {
      if (sueldoNum !== (usuario.sueldo || 0)) guardarSueldo(usuario.id, sueldoNum);
      pagarSueldo({
        usuario: { ...usuario, sueldo: sueldoNum || undefined },
        periodo,
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
                  const estado = mesDeSueldo(u, gastos, periodo).estado;
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
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${estadosSueldo[estado].color}`}>{estadosSueldo[estado].label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sueldo-periodo" className="block text-sm font-medium text-slate-700 mb-1.5">Mes que se paga</label>
              <input id="sueldo-periodo" type="month" value={periodo} onChange={e => e.target.value && elegir(usuarioId, e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="sueldo-mensual" className="block text-sm font-medium text-slate-700 mb-1.5">Sueldo mensual</label>
              <input
                id="sueldo-mensual"
                type="number"
                min="0"
                value={sueldo}
                disabled={!usuario}
                onChange={e => setSueldo(e.target.value)}
                onBlur={() => usuario && elegir(usuario.id)}
                placeholder="Ej: 600000"
                className={`${campo} disabled:bg-slate-50`}
              />
            </div>
          </div>

          {usuario && mes && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
              <div><p className="text-[11px] text-slate-500">Sueldo</p><p className="text-sm font-bold text-slate-800">{dinero(mes.sueldo)}</p></div>
              <div><p className="text-[11px] text-slate-500">Ya cobró</p><p className="text-sm font-bold text-emerald-700">{dinero(mes.pagado)}</p></div>
              <div><p className="text-[11px] text-slate-500">Le falta</p><p className="text-sm font-bold text-red-600">{dinero(mes.resta)}</p></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sueldo-monto" className="block text-sm font-medium text-slate-700 mb-1.5">Monto a pagar *</label>
              <input id="sueldo-monto" type="number" min="0" value={monto} onChange={e => { setMonto(e.target.value); setError(''); }} placeholder="0" className={`${campo} font-semibold`} />
            </div>
            <div>
              <label htmlFor="sueldo-fecha" className="block text-sm font-medium text-slate-700 mb-1.5">Fecha</label>
              <input id="sueldo-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={campo} />
            </div>
          </div>
          {mes && mes.sueldo > 0 && montoNum > mes.resta && (
            <p className="text-xs text-amber-700">Es más de lo que le falta cobrar este mes ({dinero(mes.resta)}). Se registra igual.</p>
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

/** Tarjeta de Pagos: cómo está cada persona en el mes elegido. */
export function SueldosDelMes() {
  const usuarios = useUsuarios().filter(u => u.activo);
  const gastos = useGastos();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [pagando, setPagando] = useState<{ usuarioId?: string; periodo?: string } | null>(null);
  const [cuentaDe, setCuentaDe] = useState<string | null>(null);
  const filas = usuarios.map(u => ({ usuario: u, mes: mesDeSueldo(u, gastos, periodo) }));
  const totalResta = filas.reduce((s, f) => s + f.mes.resta, 0);
  const totalPagado = filas.reduce((s, f) => s + f.mes.pagado, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-800">Sueldos del personal</h3>
          <p className="text-xs text-slate-500">
            Pagado {dinero(totalPagado)} · Falta pagar <span className={totalResta > 0 ? 'text-red-600 font-semibold' : ''}>{dinero(totalResta)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={e => e.target.value && setPeriodo(e.target.value)} aria-label="Mes" className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
          <button onClick={() => setPagando({ periodo })} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            <Wallet size={14} />Pagar sueldo
          </button>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">Cargá tu personal en Usuarios para pagarle sueldos desde acá.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {filas.map(({ usuario, mes }) => {
            const cfg = estadosSueldo[mes.estado];
            return (
              <div key={usuario.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                <Iniciales usuario={usuario} />
                <div className="flex-1 min-w-[8rem]">
                  <p className="text-sm font-medium text-slate-800">{nombreUsuario(usuario)}</p>
                  <p className="text-xs text-slate-500">
                    {mes.sueldo > 0 ? `${dinero(mes.pagado)} de ${dinero(mes.sueldo)}` : mes.pagado > 0 ? `Cobró ${dinero(mes.pagado)}` : 'Sin sueldo cargado'}
                    {mes.resta > 0 && <span className="text-red-600"> · falta {dinero(mes.resta)}</span>}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                <button onClick={() => setCuentaDe(usuario.id)} className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                  <FileText size={13} />Estado de cuenta
                </button>
                <button
                  onClick={() => setPagando({ usuarioId: usuario.id, periodo })}
                  disabled={mes.estado === 'pagado'}
                  className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 px-3 py-1.5 rounded-lg"
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
          onPagar={p => setPagando({ usuarioId: cuentaDe, periodo: p })}
        />
      )}
      {pagando && (
        <PagarSueldo
          key={`${pagando.usuarioId}-${pagando.periodo}`}
          usuarioInicial={pagando.usuarioId}
          periodoInicial={pagando.periodo}
          onCerrar={() => setPagando(null)}
        />
      )}
    </div>
  );
}
