import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  descartarComprobante,
  emitirNotaCredito,
  listarComprobantes,
  nombreComprobante,
  numeroComprobante,
  reintentarComprobante,
  type ComprobanteFiscal,
  type EstadoComprobante,
} from '../lib/facturacion';
import { loadPagos, usePagos } from '../lib/pagosStore';
import { usePedidos } from '../lib/demoStore';
import { abrirVentanaTicket, imprimirComprobanteFiscal, type LineaTicket } from '../lib/ticketFiscal';
import { imprimirTicketCobro } from '../lib/ticketCobro';
import { loadCategorias } from '../lib/categoriasStore';
import { lineasPorCategoria } from '../lib/lineasFiscales';
import { loadProductos } from '../lib/productosStore';
import { anularTicket, cobroEnCurso, nombreMedio, rechazarSolicitud, type Actor } from '../lib/cobroComanda';
import { etiquetaPedido } from '../lib/pedidosCanal';
import { anularCobroRegistrado, aplicarEnComanda, marcarTicketSinArca } from '../lib/ticketsCaja';
import PedirMotivo from '../components/PedirMotivo';
import type { Pago, Pedido } from '../lib/types';

const estados: Record<EstadoComprobante, { label: string; color: string }> = {
  autorizado: { label: 'Autorizado', color: 'bg-emerald-100 text-emerald-700' },
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  descartado: { label: 'Descartado', color: 'bg-slate-100 text-slate-500' },
};

const lineasDelComprobante = (c: ComprobanteFiscal): LineaTicket[] => {
  const pedido = loadPagos().find(p => p.id === c.pago_id)?.pedido;
  return lineasPorCategoria(pedido?.items || [], Number(c.total), loadProductos(), loadCategorias());
};

const facturaDelPago = (pagoId: string, lista: ComprobanteFiscal[]) =>
  lista.find(c => c.pago_id === pagoId && c.clase === 'factura' && c.estado !== 'descartado');

const cuando = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const resumenItems = (pedido?: Pedido) =>
  (pedido?.items || []).filter(item => item.estado !== 'cancelado').map(item => `${item.cantidad}x ${item.producto?.nombre || 'Producto'}`).join(', ');

type Vista = 'arca' | 'tickets';
type Accion =
  | { tipo: 'rechazar'; pedidoId: string }
  | { tipo: 'anular_ticket'; pedidoId: string }
  | { tipo: 'cancelar_cobro'; pagoId: string };

export default function Facturas() {
  const { user, hasRole } = useAuth();
  const pagos = usePagos();
  const pedidos = usePedidos();
  const [vista, setVista] = useState<Vista>('arca');
  const [comprobantes, setComprobantes] = useState<ComprobanteFiscal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmarNota, setConfirmarNota] = useState<string | null>(null);
  const [confirmarSinArca, setConfirmarSinArca] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [errorAccion, setErrorAccion] = useState('');
  const enCurso = useRef(false);

  const actor: Actor = {
    id: user?.id,
    nombre: user ? [user.nombre, user.apellido].filter(Boolean).join(' ') : 'Caja',
    rol: user?.rol,
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setComprobantes(await listarComprobantes());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude leer los comprobantes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const ejecutar = async (id: string, trabajo: () => Promise<ComprobanteFiscal>) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(id);
    setError('');
    setConfirmarNota(null);
    try {
      await trabajo();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      enCurso.current = false;
      setOcupado(null);
    }
  };

  const imprimir = (c: ComprobanteFiscal) => {
    const ventana = abrirVentanaTicket();
    if (!ventana) {
      setError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
      return;
    }
    void imprimirComprobanteFiscal(ventana, c, lineasDelComprobante(c));
  };

  const tieneNota = (c: ComprobanteFiscal) => comprobantes.some(n => n.asociado_id === c.id && n.estado !== 'descartado');
  const boton = 'px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50';
  const botonRojo = `${boton} text-red-600 border-red-200 hover:bg-red-50`;

  const abiertas = pedidos.filter(cobroEnCurso);
  const tickets = [...pagos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);

  const dejarSinArca = async (pago: Pago) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(pago.id);
    setError('');
    setAviso('');
    try {
      const factura = facturaDelPago(pago.id, comprobantes);
      if (factura?.estado === 'autorizado' || factura?.estado === 'pendiente') {
        throw new Error(factura.estado === 'pendiente'
          ? 'ARCA todavía no respondió por este comprobante. Esperá o reintentá antes de dejarlo como ticket.'
          : 'Esta venta ya tiene factura de ARCA. Para anularla, cancelá el cobro.');
      }
      if (factura?.estado === 'rechazado') await descartarComprobante(factura.id);
      marcarTicketSinArca(pago.id);
      setConfirmarSinArca(null);
      setAviso('Quedó como ticket. Esta comanda no se factura en ARCA.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dejar como ticket.');
    } finally {
      enCurso.current = false;
      setOcupado(null);
    }
  };

  /** Si ARCA ya autorizó la factura, primero la anula con nota de crédito. */
  const resolverFiscal = async (pago: Pago) => {
    const lista = await listarComprobantes();
    setComprobantes(lista);
    let factura = facturaDelPago(pago.id, lista);
    if (!factura) return;
    if (factura.estado === 'rechazado') {
      await descartarComprobante(factura.id);
      return;
    }
    if (factura.estado === 'pendiente') {
      factura = await reintentarComprobante(factura.id);
      if (factura.estado === 'pendiente') {
        throw new Error('ARCA todavía no respondió por esta factura. No se puede cancelar el cobro hasta saber si se autorizó.');
      }
      if (factura.estado === 'rechazado') {
        await descartarComprobante(factura.id);
        return;
      }
    }
    if (factura.estado !== 'autorizado') return;
    if (!hasRole('admin', 'encargado')) {
      throw new Error('Esta venta ya tiene factura de ARCA. Un encargado tiene que anularla.');
    }
    const notas = (await listarComprobantes()).filter(n => n.asociado_id === factura.id && n.clase === 'nota_credito' && n.estado !== 'descartado');
    if (notas.some(n => n.estado === 'pendiente')) {
      throw new Error('Hay una nota de crédito pendiente. Resolvela en Comprobantes de ARCA antes de cancelar el cobro.');
    }
    if (!notas.some(n => n.estado === 'autorizado')) {
      const nota = await emitirNotaCredito(factura.id);
      if (nota.estado !== 'autorizado') {
        throw new Error(`No se pudo emitir la nota de crédito: ${nota.error || 'sin respuesta de ARCA.'} El cobro sigue registrado.`);
      }
    }
  };

  const confirmarAccion = async (motivo: string) => {
    if (!accion || enCurso.current) return;
    enCurso.current = true;
    const id = accion.tipo === 'cancelar_cobro' ? accion.pagoId : accion.pedidoId;
    setOcupado(id);
    setErrorAccion('');
    setAviso('');
    try {
      if (accion.tipo === 'rechazar') {
        aplicarEnComanda(accion.pedidoId, pedido => rechazarSolicitud(pedido, motivo, actor));
        setAviso('Comanda rechazada. Volvió a la moza y no se factura en ARCA.');
      } else if (accion.tipo === 'anular_ticket') {
        aplicarEnComanda(accion.pedidoId, pedido => anularTicket(pedido, motivo, actor));
        setAviso('Ticket anulado. La comanda sigue en caja para cobrarla de otra forma.');
      } else {
        const pago = loadPagos().find(p => p.id === accion.pagoId);
        if (!pago) throw new Error('Ese cobro ya no está.');
        await resolverFiscal(pago);
        anularCobroRegistrado(pago, actor, motivo);
        setAviso('Cobro cancelado. Volvió el stock y la comanda quedó en caja para cobrarla de otra forma.');
        await cargar();
      }
      setAccion(null);
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar.');
      await cargar();
    } finally {
      enCurso.current = false;
      setOcupado(null);
    }
  };

  const textoAccion = accion?.tipo === 'anular_ticket'
    ? {
        titulo: 'Cancelar el ticket',
        descripcion: 'El ticket impreso deja de valer. La comanda sigue en caja para cobrarla con el medio que pagaron.',
        placeholder: 'Ej: pagaron con tarjeta en vez de efectivo…',
        confirmar: 'Cancelar ticket',
      }
    : accion?.tipo === 'cancelar_cobro'
      ? {
          titulo: 'Cancelar el cobro',
          descripcion: 'Se anula el ticket, vuelve el stock y la comanda queda para cobrarla de nuevo. Si ya tenía factura de ARCA, primero se emite la nota de crédito.',
          placeholder: 'Ej: pagaron de otra forma…',
          confirmar: 'Cancelar cobro',
        }
      : {
          titulo: 'Esta comanda no va a ARCA',
          descripcion: 'Se rechaza el cobro y la comanda vuelve a la moza. No se emite factura.',
          placeholder: 'Ej: el cliente no quiere factura, pagan en otro lado…',
          confirmar: 'Rechazar comanda',
        };

  const filaAbierta = (pedido: Pedido) => {
    const solicitud = pedido.solicitud_cobro;
    if (!solicitud) return null;
    const impreso = solicitud.estado === 'ticket_emitido';
    return (
      <div key={pedido.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-slate-800">{etiquetaPedido(pedido)}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${impreso ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {impreso ? 'Ticket impreso' : 'Cobro pedido'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {cuando(solicitud.ticket_at || solicitud.solicitada_at)} · {nombreMedio(solicitud.ticket?.metodo_pago || solicitud.metodo_pago)} · ${Number(solicitud.ticket?.total ?? solicitud.total).toLocaleString('es-AR')}
            {solicitud.solicitada_por_nombre ? ` · ${solicitud.solicitada_por_nombre}` : ''}
          </p>
          {resumenItems(pedido) && <p className="text-xs text-slate-400 mt-1 truncate">{resumenItems(pedido)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setAccion({ tipo: 'rechazar', pedidoId: pedido.id }); setErrorAccion(''); }} disabled={ocupado === pedido.id} className={boton}>
            No va a ARCA
          </button>
          {impreso && (
            <button type="button" onClick={() => { setAccion({ tipo: 'anular_ticket', pedidoId: pedido.id }); setErrorAccion(''); }} disabled={ocupado === pedido.id} className={botonRojo}>
              Cancelar ticket
            </button>
          )}
        </div>
      </div>
    );
  };

  const filaCobro = (pago: Pago) => {
    const factura = facturaDelPago(pago.id, comprobantes);
    const facturada = factura?.estado === 'autorizado';
    const pendiente = factura?.estado === 'pendiente';
    const esTicket = (pago.tipo_comprobante || 'ticket') !== 'factura';
    const puedeDejarTicket = !facturada && !pendiente && (!esTicket || factura?.estado === 'rechazado');
    const puedeCancelar = (!facturada && !pendiente) || hasRole('admin', 'encargado');
    const badge = facturada
      ? { label: 'En ARCA', color: 'bg-emerald-100 text-emerald-700' }
      : pendiente
        ? { label: 'ARCA pendiente', color: 'bg-amber-100 text-amber-700' }
        : factura?.estado === 'rechazado'
          ? { label: 'ARCA rechazó', color: 'bg-red-100 text-red-700' }
          : { label: 'Ticket', color: 'bg-slate-100 text-slate-600' };

    return (
      <div key={pago.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-slate-800">{etiquetaPedido(pago.pedido)}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
            {facturada && factura && <span className="text-sm text-slate-500">{numeroComprobante(factura)}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {cuando(pago.created_at)} · {nombreMedio(pago.metodo_pago)} · ${Number(pago.total_cobrado).toLocaleString('es-AR')}
            {pago.comprador_nombre ? ` · ${pago.comprador_nombre}` : ''}
          </p>
          {resumenItems(pago.pedido) && <p className="text-xs text-slate-400 mt-1 truncate">{resumenItems(pago.pedido)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!imprimirTicketCobro(pago)) setError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
            }}
            className={`${boton} flex items-center gap-1.5`}
          >
            <Printer size={13} />Imprimir
          </button>
          {puedeDejarTicket && (
            confirmarSinArca === pago.id ? (
              <>
                <span className="text-xs text-slate-600">¿Dejarlo como ticket, sin factura?</span>
                <button type="button" onClick={() => void dejarSinArca(pago)} disabled={ocupado === pago.id} className={botonRojo}>Sí, no va a ARCA</button>
                <button type="button" onClick={() => setConfirmarSinArca(null)} className={boton}>No</button>
              </>
            ) : (
              <button type="button" onClick={() => { setConfirmarSinArca(pago.id); setConfirmarNota(null); }} disabled={ocupado === pago.id} className={boton}>
                No va a ARCA
              </button>
            )
          )}
          {puedeCancelar ? (
            <button type="button" onClick={() => { setAccion({ tipo: 'cancelar_cobro', pagoId: pago.id }); setErrorAccion(''); }} disabled={ocupado === pago.id} className={botonRojo}>
              Cancelar cobro
            </button>
          ) : (
            <span className="text-xs text-slate-400">La anula un encargado</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Facturas</h2>
          <p className="text-sm text-slate-500">
            {vista === 'arca'
              ? 'Comprobantes enviados a ARCA. Los pendientes y rechazados se resuelven desde acá.'
              : 'Todos los tickets. Rechazá la comanda si no va a ARCA, o cancelala si pagaron de otra forma.'}
          </p>
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando} className={`${boton} flex items-center gap-1.5 self-start`}>
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="flex rounded-xl bg-slate-100 p-1 w-full sm:w-fit" role="tablist" aria-label="Qué ver en facturas">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'arca'}
          onClick={() => setVista('arca')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${vista === 'arca' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Comprobantes de ARCA
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'tickets'}
          onClick={() => setVista('tickets')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${vista === 'tickets' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Todos los tickets
          {abiertas.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{abiertas.length}</span>
          )}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
      {aviso && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{aviso}</p>}

      {vista === 'arca' ? (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {comprobantes.map(c => (
            <div key={c.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-slate-800">{nombreComprobante(c)}</span>
                  {c.estado === 'autorizado' && <span className="text-sm text-slate-500">{numeroComprobante(c)}</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estados[c.estado].color}`}>{estados[c.estado].label}</span>
                  {c.ambiente === 'homologacion' && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Prueba</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(c.created_at).toLocaleString('es-AR')} · {c.receptor_nombre} · ${Number(c.total).toLocaleString('es-AR')}
                  {c.cae ? ` · CAE ${c.cae}` : ''}
                </p>
                {c.error && <p className={`text-xs mt-1 ${c.estado === 'autorizado' ? 'text-slate-500' : 'text-red-600'}`}>{c.error}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.estado === 'autorizado' && (
                  <button type="button" onClick={() => imprimir(c)} className={`${boton} flex items-center gap-1.5`}><Printer size={13} />Imprimir</button>
                )}
                {(c.estado === 'pendiente' || c.estado === 'rechazado') && (
                  <button type="button" onClick={() => void ejecutar(c.id, () => reintentarComprobante(c.id))} disabled={ocupado === c.id} className={boton}>
                    {ocupado === c.id ? 'Enviando…' : 'Reintentar'}
                  </button>
                )}
                {c.estado === 'rechazado' && hasRole('admin', 'encargado') && (
                  <button type="button" onClick={() => void ejecutar(c.id, () => descartarComprobante(c.id))} disabled={ocupado === c.id} className={boton}>Descartar</button>
                )}
                {c.estado === 'autorizado' && c.clase === 'factura' && !tieneNota(c) && hasRole('admin', 'encargado') && (
                  confirmarNota === c.id ? (
                    <>
                      <span className="text-xs text-slate-600">No devuelve plata ni stock. ¿Emitir?</span>
                      <button type="button" onClick={() => void ejecutar(c.id, () => emitirNotaCredito(c.id))} className={botonRojo}>Sí, emitir</button>
                      <button type="button" onClick={() => setConfirmarNota(null)} className={boton}>No</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmarNota(c.id)} disabled={ocupado === c.id} className={boton}>Nota de crédito</button>
                  )
                )}
              </div>
            </div>
          ))}
          {!comprobantes.length && !cargando && (
            <div className="p-10 text-center text-sm text-slate-400">Todavía no hay comprobantes.</div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {abiertas.map(filaAbierta)}
          {tickets.map(filaCobro)}
          {!abiertas.length && !tickets.length && (
            <div className="p-10 text-center text-sm text-slate-400">Todavía no hay tickets.</div>
          )}
        </div>
      )}

      {accion && (
        <PedirMotivo
          titulo={textoAccion.titulo}
          descripcion={textoAccion.descripcion}
          placeholder={textoAccion.placeholder}
          textoConfirmar={textoAccion.confirmar}
          error={errorAccion}
          onCerrar={() => { if (!ocupado) { setAccion(null); setErrorAccion(''); } }}
          onConfirmar={motivo => void confirmarAccion(motivo)}
        />
      )}
    </div>
  );
};
