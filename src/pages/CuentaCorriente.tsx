import { useRef, useState } from 'react';
import { BookOpen, Plus, Search, X, Pencil, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ajustarCuenta, guardarClienteCuenta, mediosCobroCuenta, registrarPagoCuenta, revertirConsumoCuenta, saldoCliente, useCuentaCorriente } from '../lib/cuentaCorrienteStore';
import type { ClienteCuenta, MedioCobroCuenta } from '../lib/cuentaCorrienteStore';

const money = (value: number) => value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-amber-400';
const emptyCliente = (): ClienteCuenta => ({ id: crypto.randomUUID(), nombre: '', telefono: '', nota: '', tipo_documento: 'DNI', numero_documento: '', condicion_iva: 'Consumidor final', domicilio: '' });

export default function CuentaCorriente() {
  const { user, hasRole } = useAuth();
  const { clientes, movimientos } = useCuentaCorriente();
  const [busqueda, setBusqueda] = useState('');
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ClienteCuenta | null>(null);
  const [operacion, setOperacion] = useState<'pago' | 'ajuste' | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MedioCobroCuenta>('efectivo');
  const [motivo, setMotivo] = useState('');
  const [sentido, setSentido] = useState('restar');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const operationId = useRef('');
  const cliente = clientes.find(c => c.id === selectedId);
  const saldo = cliente ? saldoCliente(cliente.id, movimientos) : 0;
  const filas = clientes.map(c => ({ ...c, saldo: saldoCliente(c.id, movimientos) }));
  const filtrados = filas.filter(c => (!soloDeudores || c.saldo > 0) && `${c.nombre} ${c.telefono} ${c.numero_documento}`.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
  let acumulado = 0;
  const historial = movimientos.filter(m => m.cliente_id === selectedId).map(m => {
    acumulado = Math.round((acumulado + (m.tipo === 'pago' ? -m.monto : m.monto)) * 100) / 100;
    return { ...m, saldo: acumulado };
  }).reverse();
  const responsable = user ? `${user.nombre} ${user.apellido}`.trim() : '';
  const ejecutar = async (action: () => Promise<unknown>, success: string) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await action(); setDraft(null); setOperacion(null); setMensaje(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la operación.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const abrirOperacion = (tipo: 'pago' | 'ajuste') => {
    operationId.current = crypto.randomUUID(); setOperacion(tipo); setMonto(''); setMotivo(''); setError(''); setMensaje(''); setSentido('restar');
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-800">Cuenta corriente</h2><p className="text-sm text-slate-500">Clientes, consumos pendientes y pagos a cuenta.</p></div>
      <button onClick={() => { setDraft(emptyCliente()); setError(''); }} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-semibold"><Plus size={18} />Agregar cliente</button>
    </div>
    <div className="grid sm:grid-cols-3 gap-4">
      {[['Total pendiente de cobrar', money(filas.reduce((s, c) => s + c.saldo, 0))], ['Clientes con deuda', String(filas.filter(c => c.saldo > 0).length)], ['Clientes registrados', String(clientes.length)]].map(([label, value]) =>
        <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-800 mt-1">{value}</p></div>)}
    </div>
    {mensaje && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3">{mensaje}</p>}
    <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-2"><Search size={18} className="text-slate-400" /><input aria-label="Buscar cliente" placeholder="Nombre, teléfono o documento" value={busqueda} onChange={e => setBusqueda(e.target.value)} className={inputClass} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={soloDeudores} onChange={e => setSoloDeudores(e.target.checked)} />Solo clientes con deuda</label>
        </div>
        <div className="max-h-[600px] overflow-auto">
          {filtrados.map(c => <button key={c.id} onClick={() => { setSelectedId(c.id); setMensaje(''); }} className={`w-full flex justify-between gap-3 text-left p-4 border-b border-slate-100 ${selectedId === c.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
            <span className="min-w-0"><span className="block font-semibold text-slate-800 break-words">{c.nombre}</span><span className="text-xs text-slate-500">{c.telefono || 'Sin teléfono'}</span></span>
            <span className={`font-bold shrink-0 ${c.saldo > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{money(c.saldo)}</span>
          </button>)}
          {!filtrados.length && <p className="p-6 text-sm text-slate-500">{clientes.length ? 'No hay clientes con estos filtros.' : 'Agregá tu primer cliente. Después podés pasarle consumos desde Cobros.'}</p>}
        </div>
      </section>
      {!cliente ? <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500"><BookOpen className="mx-auto mb-4 text-amber-500" size={40} /><p className="font-semibold text-slate-700">Seleccioná un cliente para ver su cuenta</p><p className="text-sm mt-2">Cada consumo y pago queda registrado con su fecha y responsable.</p></div> :
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden min-w-0">
          <div className="p-5 border-b border-slate-100">
            <div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="text-xl font-bold text-slate-800 break-words">{cliente.nombre}</h3><p className="text-sm text-slate-500">{cliente.telefono || 'Sin teléfono'}{cliente.numero_documento ? ` · ${cliente.tipo_documento} ${cliente.numero_documento}` : ''}</p>{cliente.nota && <p className="text-sm text-slate-500 mt-2 break-words">{cliente.nota}</p>}</div><button aria-label="Editar cliente" onClick={() => { setDraft({ ...cliente }); setError(''); }} className="text-slate-500 self-start p-2 hover:bg-slate-100 rounded-lg"><Pencil size={18} /></button></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-500">{saldo > 0 ? 'Saldo pendiente' : 'Cuenta al día'}</p><p className="text-3xl font-bold text-slate-800">{money(saldo)}</p></div><button disabled={saldo <= 0} onClick={() => abrirOperacion('pago')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl font-semibold"><Wallet size={18} />Registrar pago</button></div>
            {hasRole('admin', 'encargado') && <button onClick={() => abrirOperacion('ajuste')} className="mt-3 text-sm text-slate-500 underline">Corregir saldo con un ajuste</button>}
          </div>
          <div className="p-5"><h4 className="font-semibold text-slate-800 mb-4">Historial de movimientos</h4>
            {!historial.length && <p className="text-sm text-slate-500">Todavía no hay movimientos. Cargá una comanda y elegí “Pasar a cuenta corriente” en Cobros.</p>}
            <div className="space-y-3">{historial.map(m => <div key={m.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold text-slate-800">{m.tipo === 'consumo' ? 'Consumo' : m.tipo === 'pago' ? 'Pago recibido' : 'Ajuste de saldo'}{m.metodo_pago ? ` · ${mediosCobroCuenta[m.metodo_pago]}` : ''}</p><p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString('es-AR')} · {m.responsable || 'Sin responsable'}</p></div><div className="text-right"><p className={`font-bold ${m.tipo === 'pago' || m.monto < 0 ? 'text-emerald-700' : 'text-orange-700'}`}>{m.tipo === 'pago' || m.monto < 0 ? '−' : '+'}{money(Math.abs(m.monto))}</p><p className="text-xs text-slate-500">Saldo: {money(m.saldo)}</p></div></div>
              <p className="text-sm text-slate-500 mt-2 break-words">{m.descripcion}</p>
              {m.pedido && <details className="mt-3 text-sm"><summary className="cursor-pointer text-amber-700 font-semibold">Ver detalle del consumo</summary><div className="mt-2 space-y-2">{m.pedido.items?.filter(i => i.estado !== 'cancelado').map(i => <div key={i.id} className="flex justify-between gap-3 text-slate-600"><span>{i.cantidad} × {i.producto?.nombre || 'Producto'} · {money(i.precio_unitario)}</span><span>{money(i.subtotal)}</span></div>)}<div className="border-t pt-2 text-slate-500">Descuento: {money(m.pedido.descuento)} · Recargo: {money(m.pedido.recargo)}<p className="font-semibold text-slate-800 mt-1">Total del consumo: {money(m.pedido.total)}</p></div></div></details>}
              {m.tipo === 'consumo' && m.pedido && hasRole('admin', 'encargado') && !movimientos.some(otro => otro.id === `anula-${m.id}`) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void ejecutar(() => revertirConsumoCuenta({ pedidoId: m.pedido!.id, responsable }), 'Consumo anulado. La comanda, la mesa y el stock volvieron atrás.')}
                  className="mt-3 text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Anular este fiado
                </button>
              )}
            </div>)}</div>
          </div>
        </section>}
    </div>
    {(draft || operacion) && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={draft ? 'Datos del cliente' : operacion === 'pago' ? 'Registrar pago' : 'Ajustar saldo'}>
      <form className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-auto" onSubmit={e => {
        e.preventDefault();
        if (draft) { const nuevo = draft; void ejecutar(async () => { await guardarClienteCuenta(nuevo); setSelectedId(nuevo.id); }, 'Cliente guardado.'); }
        else if (cliente && operacion === 'pago') void ejecutar(() => registrarPagoCuenta({ id: operationId.current, cliente_id: cliente.id, monto: Number(monto), metodo, responsable, nota: motivo }), 'Pago registrado. La deuda y la caja ya están actualizadas.');
        else if (cliente && hasRole('admin', 'encargado')) void ejecutar(() => ajustarCuenta({ id: operationId.current, cliente_id: cliente.id, monto: Number(monto) * (sentido === 'restar' ? -1 : 1), motivo, responsable }), 'Ajuste registrado en el historial.');
      }}>
        <div className="flex justify-between p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800">{draft ? 'Datos del cliente' : operacion === 'pago' ? 'Registrar pago' : 'Ajustar saldo'}</h3><button type="button" disabled={busy} aria-label="Cerrar formulario" onClick={() => { setDraft(null); setOperacion(null); }}><X size={20} /></button></div>
        <div className="p-5 space-y-4">
          {draft ? <>{([['nombre', 'Nombre *'], ['telefono', 'Teléfono (opcional)'], ['numero_documento', 'Documento (opcional)'], ['nota', 'Observaciones (opcional)']] as const).map(([key, label]) => <label key={key} className="block text-sm text-slate-600 space-y-1"><span>{label}</span><input required={key === 'nombre'} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} className={inputClass} /></label>)}</> : <>
            <p className="text-slate-600">{cliente?.nombre} · Deuda actual: <strong>{money(saldo)}</strong></p>
            {operacion === 'ajuste' && <><p className="text-sm text-slate-500">La corrección queda registrada con su motivo. No mueve dinero ni modifica el stock consumido.</p><label className="block text-sm space-y-1"><span>Tipo de ajuste</span><select value={sentido} onChange={e => setSentido(e.target.value)} className={inputClass}><option value="restar">Reducir deuda</option><option value="sumar">Aumentar deuda</option></select></label></>}
            <label className="block text-sm space-y-1"><span>Importe $</span><input required type="number" min="0.01" step="0.01" max={operacion === 'pago' || sentido === 'restar' ? saldo : undefined} value={monto} onChange={e => setMonto(e.target.value)} className={inputClass} /></label>
            {operacion === 'pago' && <label className="block text-sm space-y-1"><span>Medio de pago</span><select value={metodo} onChange={e => setMetodo(e.target.value as MedioCobroCuenta)} className={inputClass}>{Object.entries(mediosCobroCuenta).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
            <label className="block text-sm space-y-1"><span>{operacion === 'ajuste' ? 'Motivo del ajuste *' : 'Observaciones (opcional)'}</span><textarea required={operacion === 'ajuste'} value={motivo} onChange={e => setMotivo(e.target.value)} className={inputClass} /></label>
          </>}
          {error && <p role="alert" className="p-3 text-sm bg-red-50 text-red-700 rounded-xl">{error}</p>}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => { setDraft(null); setOperacion(null); }} className="px-4 py-2 text-slate-600">Cancelar</button><button disabled={busy} type="submit" className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl">{busy ? 'Guardando…' : draft ? 'Guardar cliente' : operacion === 'pago' ? 'Confirmar pago' : 'Guardar ajuste'}</button></div>
      </form>
    </div>}
  </div>;
}
