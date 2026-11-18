import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, LogIn, LogOut, Pencil, Trash2, Wallet, X } from 'lucide-react';
import type { Fichada, Profile, Rol } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { saveUsuarios, loadUsuarios, useUsuarios } from '../lib/usuariosStore';
import { useGastos } from '../lib/gastosStore';
import { useCajas } from '../lib/cajaStore';
import { cajaAbiertaActual } from '../lib/esperadoCaja';
import { cuentaBancoId, cuentaCajaDiaId, loadCuentasDinero } from '../lib/finance';
import { dayKey } from '../lib/fechas';
import { nombreUsuario } from '../lib/sueldos';
import {
  borrarFichada, corregirFichada, estaPagada, marcarEntrada, marcarSalida, minutosDe, montoDe, pagarHoras,
  textoHoras, turnoAbierto, turnosSinPagar, useFichadas, valorHoraDe, type MedioPagoHoras,
} from '../lib/fichadas';

const dinero = (valor: number) => `$${Math.round(valor).toLocaleString('es-AR')}`;
const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white';
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nombresRol: Record<Rol, string> = { admin: 'Admin', encargado: 'Encargado', cajero: 'Caja', moza: 'Salón', cocina: 'Cocina' };

/** ISO → valor de un <input type="datetime-local"> en la hora de esta compu. */
const aInputLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
};
const desdeInputLocal = (valor: string) => (valor ? new Date(valor).toISOString() : '');

const Iniciales = ({ usuario }: { usuario: Profile }) => (
  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
    {usuario.nombre[0]}{usuario.apellido?.[0] || ''}
  </div>
);

const useAhora = () => {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return ahora;
};

/**
 * "08:50" → la fecha y hora más cercana para atrás: si esa hora todavía no llegó hoy,
 * es de ayer (pasada la medianoche, poner 23:50 es anoche).
 */
const horaHaciaAtras = (valor: string, ahora: Date) => {
  const [h, m] = valor.split(':').map(Number);
  const fecha = new Date(ahora);
  fecha.setHours(h, m, 0, 0);
  if (fecha.getTime() > ahora.getTime() + 60 * 1000) fecha.setDate(fecha.getDate() - 1);
  return fecha;
};

const horaInput = (fecha: Date) => `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;

/** Para cuando se le pasó marcar: pone la hora en que llegó o se fue de verdad. */
function OtraHora({ saliendo, onMarcar }: { saliendo: boolean; onMarcar: (marcada: Date) => boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState('');
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => { setValor(horaInput(new Date())); setAbierto(true); }}
        className="-mt-1 self-center text-xs font-medium text-slate-500 hover:text-amber-700 underline-offset-2 hover:underline"
      >
        ¿Se pasó la hora? Marcar {saliendo ? 'la salida' : 'la entrada'} a otra hora
      </button>
    );
  }
  const marcada = valor ? horaHaciaAtras(valor, new Date()) : null;
  const esAyer = marcada && marcada.toDateString() !== new Date().toDateString();
  return (
    <form
      className="-mt-1 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2"
      onSubmit={e => {
        e.preventDefault();
        if (marcada && onMarcar(marcada)) setAbierto(false);
      }}
    >
      <label className="block text-xs font-medium text-amber-900">
        {saliendo ? '¿A qué hora se fue?' : '¿A qué hora llegó?'}
      </label>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="time"
          required
          value={valor}
          onChange={e => setValor(e.target.value)}
          aria-label={saliendo ? 'Hora de salida' : 'Hora de entrada'}
          className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-base font-semibold outline-none bg-white"
        />
        <button type="submit" disabled={!valor} className={`px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${saliendo ? 'bg-red-500 hover:bg-red-400' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
          Marcar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="p-2 text-slate-400 hover:bg-white rounded-lg" aria-label="Cancelar"><X size={15} /></button>
      </div>
      {esAyer && <p className="text-[11px] text-amber-800">Queda como de ayer ({marcada?.toLocaleDateString('es-AR')}).</p>}
    </form>
  );
}

/** Cuánto gana por hora: se edita acá mismo. */
function ValorHora({ usuario, editable }: { usuario: Profile; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(usuario.valor_hora || ''));
  const guardar = () => {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return;
    const ahora = new Date().toISOString();
    saveUsuarios(loadUsuarios().map(u => (u.id === usuario.id ? { ...u, valor_hora: numero > 0 ? numero : undefined, updated_at: ahora } : u)));
    setEditando(false);
  };
  if (editando) {
    return (
      <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); guardar(); }}>
        <span className="text-xs text-slate-500">$</span>
        <input
          autoFocus
          type="number"
          min="0"
          value={valor}
          onChange={e => setValor(e.target.value)}
          aria-label={`Cuánto gana por hora ${usuario.nombre}`}
          className="w-24 border border-amber-300 rounded-lg px-2 py-1 text-sm outline-none"
        />
        <span className="text-xs text-slate-500">/ hora</span>
        <button type="submit" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" aria-label="Guardar"><Check size={15} /></button>
        <button type="button" onClick={() => { setEditando(false); setValor(String(usuario.valor_hora || '')); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded" aria-label="Cancelar"><X size={15} /></button>
      </form>
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => setEditando(true)}
      className={`flex items-center gap-1 text-xs ${usuario.valor_hora ? 'text-slate-600' : 'text-amber-700 font-semibold'} ${editable ? 'hover:text-amber-700' : ''}`}
      title={editable ? 'Cambiar cuánto gana por hora' : undefined}
    >
      {usuario.valor_hora ? `${dinero(usuario.valor_hora)} / hora` : 'Sin valor por hora'}
      {editable && <Pencil size={11} />}
    </button>
  );
}

function PagarHoras({ usuario, onCerrar }: { usuario: Profile; onCerrar: () => void }) {
  const { user } = useAuth();
  const fichadas = useFichadas();
  const gastos = useGastos();
  const cajas = useCajas();
  const pendientes = turnosSinPagar(fichadas, usuario.id, gastos);
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(pendientes.map(f => f.id)));
  const turnos = pendientes.filter(f => elegidas.has(f.id));
  const calculado = montoDe(turnos, usuario);
  const [monto, setMonto] = useState<string | null>(null);
  const montoFinal = monto === null ? calculado : Number(monto) || 0;
  const cajaAbierta = cajaAbiertaActual(cajas);
  const [medio, setMedio] = useState<MedioPagoHoras>(cajaAbierta ? 'caja_dia' : 'caja_grande');
  const cuentasBanco = loadCuentasDinero().filter(c => c.activa && c.tipo !== 'efectivo' && c.id !== cuentaCajaDiaId);
  const [cuentaId, setCuentaId] = useState(cuentasBanco.find(c => c.id === cuentaBancoId)?.id || cuentasBanco[0]?.id || cuentaBancoId);
  const [error, setError] = useState('');
  const abierto = turnoAbierto(fichadas, usuario.id);
  const sinValor = turnos.some(f => valorHoraDe(f, usuario) <= 0);

  const alternar = (id: string) => {
    setElegidas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
    setMonto(null);
  };

  const confirmar = () => {
    try {
      pagarHoras({
        usuario,
        fichadaIds: turnos.map(f => f.id),
        monto: montoFinal,
        medio,
        cuenta_id: medio === 'transferencia' ? cuentaId : undefined,
        creado_por: user ? nombreUsuario(user) : undefined,
      });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    }
  };

  const medios: { id: MedioPagoHoras; label: string; ayuda: string }[] = [
    { id: 'caja_dia', label: 'Caja del día', ayuda: cajaAbierta ? 'Efectivo del cajón: lo descuenta la caja abierta ahora.' : 'La caja está cerrada.' },
    { id: 'caja_grande', label: 'Caja grande', ayuda: 'Efectivo de la caja grande. No toca el arqueo del día.' },
    { id: 'transferencia', label: 'Transferencia', ayuda: 'Sale del banco o la cuenta que elijas.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={`Pagar horas a ${usuario.nombre}`} className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Iniciales usuario={usuario} />
            <div>
              <h3 className="font-bold text-slate-800">Pagar horas · {nombreUsuario(usuario)}</h3>
              <p className="text-sm text-slate-500">Queda en Pagos como sueldo y en su estado de cuenta.</p>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {abierto && (
            <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Está trabajando desde las {hora(abierto.entrada)}. Ese turno se suma cuando le marquen la salida.
            </p>
          )}
          {pendientes.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-3 text-center">No tiene horas sin pagar.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">Turnos sin pagar</p>
              {pendientes.map(f => (
                <label key={f.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer ${elegidas.has(f.id) ? 'border-amber-300 bg-amber-50/60' : 'border-slate-100'}`}>
                  <input type="checkbox" checked={elegidas.has(f.id)} onChange={() => alternar(f.id)} className="accent-amber-500" />
                  <span className="flex-1 text-slate-700">{fechaHora(f.entrada)} a {f.salida && (dayKey(f.salida) === dayKey(f.entrada) ? hora(f.salida) : fechaHora(f.salida))}</span>
                  <span className="text-slate-500">{textoHoras(minutosDe(f))}</span>
                  <span className="w-20 text-right font-semibold text-slate-800">{dinero(montoDe([f], usuario))}</span>
                </label>
              ))}
              <div className="flex justify-between text-sm pt-1 px-1">
                <span className="text-slate-500">{textoHoras(turnos.reduce((s, f) => s + minutosDe(f), 0))} trabajadas</span>
                <span className="font-semibold text-slate-700">Calculado: {dinero(calculado)}</span>
              </div>
              {sinValor && <p className="text-xs text-amber-700">Hay turnos sin valor por hora: cargá cuánto gana por hora o poné el monto a mano.</p>}
            </div>
          )}

          <div>
            <label htmlFor="horas-monto" className="block text-sm font-medium text-slate-700 mb-1.5">Monto a pagar</label>
            <input id="horas-monto" type="number" min="0" value={monto ?? String(calculado)} onChange={e => { setMonto(e.target.value); setError(''); }} className={`${campo} font-semibold text-lg`} />
            {monto !== null && Number(monto) !== calculado && (
              <button type="button" onClick={() => setMonto(null)} className="mt-1 text-xs text-amber-700 hover:underline">Volver al calculado ({dinero(calculado)})</button>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">¿De dónde sale la plata?</p>
            <div className="grid grid-cols-3 gap-2">
              {medios.map(m => (
                <button
                  key={m.id}
                  type="button"
                  disabled={m.id === 'caja_dia' && !cajaAbierta}
                  onClick={() => { setMedio(m.id); setError(''); }}
                  className={`py-2.5 px-2 rounded-xl border-2 text-sm font-medium disabled:opacity-40 ${medio === m.id ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-100 text-slate-600'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{medios.find(m => m.id === medio)?.ayuda}</p>
            {medio === 'transferencia' && cuentasBanco.length > 1 && (
              <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} aria-label="Cuenta" className={`${campo} mt-2`}>
                {cuentasBanco.map(c => <option key={c.id} value={c.id}>{c.nombre} - {dinero(c.saldo)}</option>)}
              </select>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t border-slate-100">
          <button
            onClick={confirmar}
            disabled={turnos.length === 0 || montoFinal <= 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Wallet size={16} />Pagar {dinero(montoFinal)} a {usuario.nombre}
          </button>
        </div>
      </div>
    </div>
  );
}

function CorregirTurno({ fichada, usuario, onCerrar }: { fichada: Fichada; usuario?: Profile; onCerrar: () => void }) {
  const { user } = useAuth();
  const [entrada, setEntrada] = useState(aInputLocal(fichada.entrada));
  const [salida, setSalida] = useState(aInputLocal(fichada.salida));
  const [valor, setValor] = useState(String(fichada.valor_hora || usuario?.valor_hora || ''));
  const [error, setError] = useState('');
  const guardar = () => {
    try {
      corregirFichada(fichada.id, { entrada: desdeInputLocal(entrada), salida: salida ? desdeInputLocal(salida) : undefined, valor_hora: Number(valor) || 0 }, user ? nombreUsuario(user) : undefined);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label="Corregir turno" className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">Corregir turno</h3>
            <p className="text-sm text-slate-500">{usuario ? nombreUsuario(usuario) : 'Empleado'} · por si se olvidaron de marcar.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="turno-entrada" className="block text-sm font-medium text-slate-700 mb-1.5">Entrada</label>
            <input id="turno-entrada" type="datetime-local" value={entrada} onChange={e => { setEntrada(e.target.value); setError(''); }} className={campo} />
          </div>
          <div>
            <label htmlFor="turno-salida" className="block text-sm font-medium text-slate-700 mb-1.5">Salida</label>
            <input id="turno-salida" type="datetime-local" value={salida} onChange={e => { setSalida(e.target.value); setError(''); }} className={campo} />
            <p className="mt-1 text-xs text-slate-500">Vacío: sigue trabajando.</p>
          </div>
          <div>
            <label htmlFor="turno-valor" className="block text-sm font-medium text-slate-700 mb-1.5">Valor de la hora en este turno</label>
            <input id="turno-valor" type="number" min="0" value={valor} onChange={e => setValor(e.target.value)} className={campo} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button onClick={guardar} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            <Check size={16} />Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Gastos → Reloj del personal: entradas, salidas y el pago de las horas trabajadas. */
export default function RelojPersonal() {
  const { user } = useAuth();
  const ahora = useAhora();
  const usuarios = useUsuarios();
  const activos = usuarios.filter(u => u.activo);
  const fichadas = useFichadas();
  const gastos = useGastos();
  const [dia, setDia] = useState(dayKey());
  const [pagando, setPagando] = useState<Profile | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Fichada | null>(null);
  const [aviso, setAviso] = useState<{ usuario: Profile; texto: string } | null>(null);
  const [error, setError] = useState('');
  const actor = user ? nombreUsuario(user) : undefined;
  const editaValores = user?.rol === 'admin' || user?.rol === 'encargado';
  const usuarioDe = (id: string) => usuarios.find(u => u.id === id);

  const delDia = useMemo(
    () => fichadas.filter(f => dayKey(f.entrada) === dia).sort((a, b) => b.entrada.localeCompare(a.entrada)),
    [fichadas, dia],
  );

  /** Devuelve si se pudo, para que el formulario de otra hora se cierre solo cuando quedó marcado. */
  const entrar = (u: Profile, marcada?: Date) => {
    setError('');
    try {
      const turno = marcarEntrada(u, actor, new Date(), marcada);
      setAviso({ usuario: u, texto: `Entrada de ${u.nombre} marcada a las ${hora(turno.entrada)}${marcada ? ' (puesta a mano)' : ''}.` });
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo marcar la entrada.'); return false; }
  };

  const salir = (u: Profile, marcada?: Date) => {
    setError('');
    try {
      const turno = marcarSalida(u, actor, new Date(), marcada);
      setAviso({ usuario: u, texto: `Salida de ${u.nombre}${marcada ? ` a las ${hora(turno.salida as string)} (puesta a mano)` : ''}: ${textoHoras(minutosDe(turno))} · ${dinero(montoDe([turno], u))}.` });
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo marcar la salida.'); return false; }
  };

  const borrar = (f: Fichada) => {
    const u = usuarioDe(f.empleado_id);
    if (!window.confirm(`¿Borrar el turno de ${u?.nombre || 'este empleado'} del ${fechaHora(f.entrada)}?`)) return;
    try { borrarFichada(f.id); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar.'); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 to-amber-950 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-xl flex items-center gap-2"><Clock size={20} />Reloj del personal</h2>
            <p className="text-slate-300 text-sm mt-1">Marcá la entrada y la salida de cada uno. Las horas se pagan solas según lo que gana por hora.</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-bold text-white tabular-nums">{ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
            <p className="text-xs text-slate-400 capitalize">{ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
      </div>

      {aviso && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2"><Check size={16} />{aviso.texto}</span>
          <div className="flex items-center gap-2">
            {turnosSinPagar(fichadas, aviso.usuario.id, gastos).length > 0 && (
              <button onClick={() => { setPagando(aviso.usuario); setAviso(null); }} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                <Wallet size={13} />Pagar ahora
              </button>
            )}
            <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"><X size={15} /></button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}

      {activos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Cargá tu personal en Usuarios para usar el reloj.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activos.map(u => {
            const abierto = turnoAbierto(fichadas, u.id);
            const pendientes = turnosSinPagar(fichadas, u.id, gastos);
            const minutosPendientes = pendientes.reduce((s, f) => s + minutosDe(f), 0);
            return (
              <div key={u.id} className={`bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 ${abierto ? 'border-emerald-300' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <Iniciales usuario={u} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{nombreUsuario(u)}</p>
                    <p className="text-xs text-slate-400">{nombresRol[u.rol]}</p>
                    <ValorHora key={`${u.id}-${u.valor_hora}`} usuario={u} editable={editaValores} />
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${abierto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {abierto ? 'Trabajando' : 'Afuera'}
                  </span>
                </div>

                {abierto ? (
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Entró a las <strong>{hora(abierto.entrada)}</strong> · lleva <strong className="tabular-nums">{textoHoras(minutosDe(abierto, ahora))}</strong>
                    {valorHoraDe(abierto, u) > 0 && <span> · {dinero(montoDe([abierto], u, ahora))}</span>}
                  </div>
                ) : null}

                <button
                  onClick={() => (abierto ? salir(u) : entrar(u))}
                  className={`w-full min-h-[48px] rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 ${abierto ? 'bg-red-500 hover:bg-red-400' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                  {abierto ? <><LogOut size={18} />Marcar salida</> : <><LogIn size={18} />Marcar entrada</>}
                </button>
                <OtraHora key={abierto ? `salida-${abierto.id}` : 'entrada'} saliendo={Boolean(abierto)} onMarcar={marcada => (abierto ? salir(u, marcada) : entrar(u, marcada))} />

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">
                    {pendientes.length > 0
                      ? <>Sin pagar: <strong className="text-slate-700">{textoHoras(minutosPendientes)}</strong> · <strong className="text-slate-700">{dinero(montoDe(pendientes, u))}</strong></>
                      : 'No se le deben horas'}
                  </p>
                  <button
                    onClick={() => setPagando(u)}
                    disabled={pendientes.length === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-amber-50 px-3 py-1.5 rounded-lg"
                  >
                    <Wallet size={13} />Pagar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">Turnos del día</h3>
            <p className="text-xs text-slate-500">Los que entraron ese día. Lo pagado ya no se puede corregir.</p>
          </div>
          <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Día" className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
        </div>
        {delDia.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">No hay turnos ese día.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Empleado</th>
                  <th className="px-4 py-2 text-left font-medium">Entrada</th>
                  <th className="px-4 py-2 text-left font-medium">Salida</th>
                  <th className="px-4 py-2 text-right font-medium">Horas</th>
                  <th className="px-4 py-2 text-right font-medium">Monto</th>
                  <th className="px-4 py-2 text-left font-medium">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {delDia.map(f => {
                  const u = usuarioDe(f.empleado_id);
                  const pagada = estaPagada(f, gastos);
                  return (
                    <tr key={f.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{u ? nombreUsuario(u) : 'Empleado borrado'}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {hora(f.entrada)}
                        {f.entrada_manual && <span className="ml-1 text-[11px] text-amber-700" title={`Puesta a mano${f.entrada_por ? ` por ${f.entrada_por}` : ''}`}>a mano</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {f.salida ? (dayKey(f.salida) === dayKey(f.entrada) ? hora(f.salida) : fechaHora(f.salida)) : '—'}
                        {f.salida_manual && <span className="ml-1 text-[11px] text-amber-700" title={`Puesta a mano${f.salida_por ? ` por ${f.salida_por}` : ''}`}>a mano</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{textoHoras(minutosDe(f, ahora))}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{dinero(montoDe([f], u, ahora))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${!f.salida ? 'bg-emerald-100 text-emerald-700' : pagada ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                          {!f.salida ? 'Trabajando' : pagada ? 'Pagado' : 'Sin pagar'}
                        </span>
                        {f.corregido_por && <span className="ml-1 text-[11px] text-slate-400" title={`Corregido por ${f.corregido_por}`}>corregido</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {!pagada && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setCorrigiendo(f)} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg" aria-label="Corregir turno" title="Corregir"><Pencil size={14} /></button>
                            <button onClick={() => borrar(f)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="Borrar turno" title="Borrar"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagando && <PagarHoras key={pagando.id} usuario={usuarios.find(u => u.id === pagando.id) || pagando} onCerrar={() => setPagando(null)} />}
      {corrigiendo && <CorregirTurno fichada={corrigiendo} usuario={usuarioDe(corrigiendo.empleado_id)} onCerrar={() => setCorrigiendo(null)} />}
    </div>
  );
}
