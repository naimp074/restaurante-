import { useCallback, useEffect, useState } from 'react';
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
import { loadPagos } from '../lib/pagosStore';
import { abrirVentanaTicket, imprimirComprobanteFiscal, type LineaTicket } from '../lib/ticketFiscal';
import { loadCategorias } from '../lib/categoriasStore';
import { lineasPorCategoria } from '../lib/lineasFiscales';
import { loadProductos } from '../lib/productosStore';

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

export default function Facturas() {
  const { hasRole } = useAuth();
  const [comprobantes, setComprobantes] = useState<ComprobanteFiscal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmarNota, setConfirmarNota] = useState<string | null>(null);

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

  const ejecutar = async (id: string, accion: () => Promise<ComprobanteFiscal>) => {
    setOcupado(id);
    setError('');
    setConfirmarNota(null);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    }
    await cargar();
    setOcupado(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Facturas</h2>
          <p className="text-sm text-slate-500">Comprobantes enviados a ARCA. Los pendientes y rechazados se resuelven desde acá.</p>
        </div>
        <button onClick={() => void cargar()} disabled={cargando} className={`${boton} flex items-center gap-1.5`}>
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

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
                <button onClick={() => imprimir(c)} className={`${boton} flex items-center gap-1.5`}><Printer size={13} />Imprimir</button>
              )}
              {(c.estado === 'pendiente' || c.estado === 'rechazado') && (
                <button onClick={() => void ejecutar(c.id, () => reintentarComprobante(c.id))} disabled={ocupado === c.id} className={boton}>
                  {ocupado === c.id ? 'Enviando…' : 'Reintentar'}
                </button>
              )}
              {c.estado === 'rechazado' && hasRole('admin', 'encargado') && (
                <button onClick={() => void ejecutar(c.id, () => descartarComprobante(c.id))} disabled={ocupado === c.id} className={boton}>Descartar</button>
              )}
              {c.estado === 'autorizado' && c.clase === 'factura' && !tieneNota(c) && hasRole('admin', 'encargado') && (
                confirmarNota === c.id ? (
                  <>
                    <span className="text-xs text-slate-600">No devuelve plata ni stock. ¿Emitir?</span>
                    <button onClick={() => void ejecutar(c.id, () => emitirNotaCredito(c.id))} className={`${boton} text-red-600 border-red-200`}>Sí, emitir</button>
                    <button onClick={() => setConfirmarNota(null)} className={boton}>No</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmarNota(c.id)} disabled={ocupado === c.id} className={boton}>Nota de crédito</button>
                )
              )}
            </div>
          </div>
        ))}
        {!comprobantes.length && !cargando && (
          <div className="p-10 text-center text-sm text-slate-400">Todavía no hay comprobantes.</div>
        )}
      </div>
    </div>
  );
}
