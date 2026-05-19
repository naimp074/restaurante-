import { useState } from 'react';
import { CreditCard, DollarSign, Check, X, Printer, TrendingUp, ArrowRight } from 'lucide-react';
import type { Pedido, MetodoPago, Pago } from '../lib/types';
import { mockPedidos } from '../lib/mockData';

const metodosConfig: Record<MetodoPago, { label: string; color: string; icon: string }> = {
  efectivo: { label: 'Efectivo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '$' },
  transferencia: { label: 'Transferencia', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '↔' },
  debito: { label: 'Débito', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '💳' },
  credito: { label: 'Crédito', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '💳' },
  mixto: { label: 'Pago Mixto', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: '+' },
};

export default function Caja() {
  const [pedidos] = useState<Pedido[]>(
    mockPedidos.filter(p => p.estado === 'entregado' || p.estado === 'abierto' || p.estado === 'en_preparacion')
  );
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [descuento, setDescuento] = useState(0);
  const [recargo, setRecargo] = useState(0);
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [pagosRegistrados, setPagosRegistrados] = useState<Pago[]>([]);
  const [showTicket, setShowTicket] = useState(false);
  const [lastPago, setLastPago] = useState<Pago | null>(null);

  const calcTotal = () => {
    if (!selectedPedido) return 0;
    return selectedPedido.subtotal - descuento + recargo;
  };

  const calcVuelto = () => {
    const ef = parseFloat(montoEfectivo) || 0;
    return Math.max(0, ef - calcTotal());
  };

  const procesarPago = () => {
    if (!selectedPedido) return;
    const total = calcTotal();
    const pago: Pago = {
      id: `pago-${Date.now()}`,
      pedido_id: selectedPedido.id,
      cajero_id: 'demo-admin-id',
      metodo_pago: metodoPago,
      monto: total,
      monto_efectivo: metodoPago === 'efectivo' ? parseFloat(montoEfectivo) || total : 0,
      monto_transferencia: metodoPago === 'transferencia' ? total : 0,
      monto_debito: metodoPago === 'debito' ? total : 0,
      monto_credito: metodoPago === 'credito' ? total : 0,
      descuento_aplicado: descuento,
      recargo_aplicado: recargo,
      total_cobrado: total,
      vuelto: calcVuelto(),
      created_at: new Date().toISOString(),
      pedido: selectedPedido,
    };
    setPagosRegistrados(prev => [pago, ...prev]);
    setLastPago(pago);
    setShowTicket(true);
    setSelectedPedido(null);
    setDescuento(0);
    setRecargo(0);
    setMontoEfectivo('');
  };

  const ventaHoy = pagosRegistrados.reduce((s, p) => s + p.total_cobrado, 0);
  const ticketProm = pagosRegistrados.length > 0 ? ventaHoy / pagosRegistrados.length : 0;

  return (
    <div className="flex gap-6 h-full">
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Cobrado hoy</p>
            <p className="text-xl font-bold text-slate-800">${ventaHoy.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Tickets</p>
            <p className="text-xl font-bold text-slate-800">{pagosRegistrados.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mesas por Cobrar</p>
          </div>
          <div className="divide-y divide-slate-50">
            {pedidos.filter(p => p.total > 0).map(pedido => (
              <button
                key={pedido.id}
                onClick={() => setSelectedPedido(pedido)}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-colors ${selectedPedido?.id === pedido.id ? 'bg-amber-50 border-l-2 border-amber-500' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-slate-800 text-sm">Mesa {pedido.mesa?.numero}</span>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                    {pedido.estado === 'entregado' ? 'Por cobrar' : pedido.estado}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{pedido.empleado?.nombre}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">{pedido.items?.length} items</span>
                  <span className="text-sm font-bold text-slate-800">${pedido.total.toLocaleString()}</span>
                </div>
              </button>
            ))}
            {pedidos.filter(p => p.total > 0).length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No hay mesas por cobrar</div>
            )}
          </div>
        </div>

        {pagosRegistrados.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Último pagos</p>
            </div>
            <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {pagosRegistrados.slice(0, 5).map(pago => (
                <div key={pago.id} className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">Mesa {pago.pedido?.mesa?.numero}</span>
                    <span className="text-sm font-bold text-emerald-600">${pago.total_cobrado.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs text-slate-400">{metodosConfig[pago.metodo_pago].label}</span>
                    <span className="text-xs text-slate-400">{new Date(pago.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {selectedPedido ? (
          <div className="bg-white rounded-2xl border border-slate-200 h-full flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Mesa {selectedPedido.mesa?.numero}</h3>
                  <p className="text-sm text-slate-500">{selectedPedido.empleado?.nombre} · {selectedPedido.cantidad_personas} personas</p>
                </div>
                <button
                  onClick={() => setSelectedPedido(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2 mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Detalle del pedido</h4>
                {selectedPedido.items?.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.cantidad}x {item.producto?.nombre}</span>
                    <span className="font-medium text-slate-800">${item.subtotal.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span>${selectedPedido.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-24">Descuento $</label>
                  <input
                    type="number"
                    value={descuento || ''}
                    onChange={e => setDescuento(parseFloat(e.target.value) || 0)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-emerald-600"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-24">Recargo $</label>
                  <input
                    type="number"
                    value={recargo || ''}
                    onChange={e => setRecargo(parseFloat(e.target.value) || 0)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-orange-600"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t border-slate-200">
                  <span>TOTAL</span>
                  <span className="text-amber-600">${calcTotal().toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Método de pago</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(Object.keys(metodosConfig) as MetodoPago[]).map(met => (
                    <button
                      key={met}
                      onClick={() => setMetodoPago(met)}
                      className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        metodoPago === met
                          ? metodosConfig[met].color + ' border-current shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {metodosConfig[met].label}
                    </button>
                  ))}
                </div>

                {(metodoPago === 'efectivo' || metodoPago === 'mixto') && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-600 w-28">Monto recibido $</label>
                    <input
                      type="number"
                      value={montoEfectivo}
                      onChange={e => setMontoEfectivo(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 font-semibold"
                      placeholder={calcTotal().toString()}
                    />
                  </div>
                )}

                {montoEfectivo && calcVuelto() > 0 && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                    <span className="text-sm text-emerald-700 font-medium">Vuelto</span>
                    <span className="text-lg font-bold text-emerald-700">${calcVuelto().toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100">
              <button
                onClick={procesarPago}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 text-lg transition-all shadow-lg shadow-emerald-500/30"
              >
                <Check size={22} />
                Cobrar ${calcTotal().toLocaleString()}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <CreditCard size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-lg font-medium">Seleccioná una mesa para cobrar</p>
            </div>
          </div>
        )}
      </div>

      {showTicket && lastPago && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Pago registrado</h3>
              <p className="text-slate-500 text-sm mt-1">Mesa {lastPago.pedido?.mesa?.numero}</p>
            </div>

            <div className="p-6 space-y-2 border-b border-dashed border-slate-200">
              <div className="text-center">
                <p className="text-sm text-slate-500">Total cobrado</p>
                <p className="text-3xl font-bold text-slate-800">${lastPago.total_cobrado.toLocaleString()}</p>
              </div>
              {lastPago.vuelto > 0 && (
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-slate-500">Vuelto</span>
                  <span className="font-bold text-emerald-600">${lastPago.vuelto.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Método</span>
                <span className="font-medium text-slate-700">{metodosConfig[lastPago.metodo_pago].label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Hora</span>
                <span className="font-medium text-slate-700">{new Date(lastPago.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="p-6 flex gap-3">
              <button className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50">
                <Printer size={14} />
                Imprimir
              </button>
              <button
                onClick={() => setShowTicket(false)}
                className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
