import { useState, useEffect } from 'react';
import { Clock, Check, ChefHat, Bell, AlertCircle, Maximize2, X } from 'lucide-react';
import type { Pedido, EstadoItem } from '../lib/types';
import { loadDemoPedidos, saveDemoPedidos, usePedidos } from '../lib/demoStore';
import { canalDe, etiquetaPedido } from '../lib/pedidosCanal';
import { DetalleItem } from '../components/OpcionesProducto';
import RelojItem from '../components/RelojItem';
import { conEstado } from '../lib/tiempoItem';
import { itemsParaCocina } from '../lib/cobroComanda';

const colorCanal: Record<string, string> = {
  mostrador: 'bg-violet-100 text-violet-700',
  delivery: 'bg-sky-100 text-sky-700',
  pedidosya: 'bg-rose-100 text-rose-700',
};

const estadoConfig: Record<string, { label: string; color: string; bg: string; action: string; next: EstadoItem }> = {
  pendiente: { label: 'Nuevo', color: 'text-yellow-700', bg: 'bg-yellow-100', action: 'Iniciar', next: 'en_preparacion' },
  en_preparacion: { label: 'En preparación', color: 'text-orange-700', bg: 'bg-orange-100', action: 'Marcar listo', next: 'listo' },
  listo: { label: 'Listo', color: 'text-emerald-700', bg: 'bg-emerald-100', action: 'Marcar entregado', next: 'entregado' },
  entregado: { label: 'Entregado', color: 'text-slate-500', bg: 'bg-slate-100', action: '', next: 'entregado' },
};

export default function Cocina() {
  const pedidos = usePedidos();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  // Comanda abierta en grande (para leerla bien en la tablet).
  const [abiertaId, setAbiertaId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getElapsed = (timestamp: string) => {
    const diff = Math.floor((currentTime.getTime() - new Date(timestamp).getTime()) / 1000);
    const min = Math.floor(diff / 60);
    const sec = diff % 60;
    return { min, sec, total: diff };
  };

  const getTimerColor = (seconds: number) => {
    if (seconds < 600) return 'text-emerald-600';
    if (seconds < 900) return 'text-amber-600';
    return 'text-red-600';
  };

  const advanceItemState = (pedidoId: string, itemId: string) => {
    saveDemoPedidos(loadDemoPedidos().map(p => {
      if (p.id !== pedidoId) return p;
      const items = p.items?.map(item => {
        if (item.id !== itemId) return item;
        const next = estadoConfig[item.estado]?.next || item.estado;
        return conEstado(item, next);
      });
      const enviados = (items || []).filter(i => !i.sin_enviar);
      const allDone = enviados.every(i => i.estado === 'entregado' || i.estado === 'cancelado');
      const allReady = enviados.every(i => i.estado === 'listo' || i.estado === 'entregado' || i.estado === 'cancelado');
      return {
        ...p,
        items,
        estado: allDone ? 'entregado' : allReady ? 'listo' : p.estado,
      } as Pedido;
    }));
  };

  /** Pasa a "listo" todo lo que todavía se está haciendo en esa comanda. */
  const marcarTodoListo = (pedidoId: string) => {
    saveDemoPedidos(loadDemoPedidos().map(p => {
      if (p.id !== pedidoId) return p;
      const items = p.items?.map(item =>
        !item.sin_enviar && (item.estado === 'pendiente' || item.estado === 'en_preparacion') ? conEstado(item, 'listo') : item
      );
      const enviados = (items || []).filter(i => !i.sin_enviar);
      const allReady = enviados.every(i => i.estado === 'listo' || i.estado === 'entregado' || i.estado === 'cancelado');
      return { ...p, items, estado: allReady ? 'listo' : p.estado } as Pedido;
    }));
  };

  const colorBoton = (estado: EstadoItem) =>
    estado === 'pendiente'
      ? 'bg-orange-500 hover:bg-orange-400 text-white'
      : estado === 'en_preparacion'
      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
      : estado === 'listo'
      ? 'bg-blue-500 hover:bg-blue-400 text-white'
      : 'bg-slate-200 text-slate-500';

  const enCocina = pedidos.filter(p =>
    p.estado !== 'abierto' && p.estado !== 'entregado' && p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado'
  );
  // Lo que la moza cargó y todavía no envió no aparece hasta que lo mande.
  const activeOrders = enCocina.filter(p => itemsParaCocina(p).some(i => i.estado !== 'entregado'));
  const pendingItems = enCocina.flatMap(p => itemsParaCocina(p).filter(i => i.estado === 'pendiente')).length;
  const inProgressItems = enCocina.flatMap(p => itemsParaCocina(p).filter(i => i.estado === 'en_preparacion')).length;
  const readyItems = enCocina.flatMap(p => itemsParaCocina(p).filter(i => i.estado === 'listo')).length;
  const abierta = abiertaId ? activeOrders.find(p => p.id === abiertaId) || null : null;

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-yellow-600" size={20} />
          <div>
            <p className="text-xl font-bold text-yellow-800">{pendingItems}</p>
            <p className="text-xs text-yellow-600">Nuevos</p>
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
          <ChefHat className="text-orange-600" size={20} />
          <div>
            <p className="text-xl font-bold text-orange-800">{inProgressItems}</p>
            <p className="text-xs text-orange-600">En preparación</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="text-emerald-600" size={20} />
          <div>
            <p className="text-xl font-bold text-emerald-800">{readyItems}</p>
            <p className="text-xs text-emerald-600">Listos para servir</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <Bell className="text-blue-600" size={20} />
          <div>
            <p className="text-xl font-bold text-blue-800">{activeOrders.length}</p>
            <p className="text-xs text-blue-600">Comandas activas</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">Comandas Activas</h2>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'cards' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >Cards</button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >Lista</button>
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <ChefHat size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">Sin comandas pendientes</p>
            <p className="text-sm">La cocina está al día</p>
          </div>
        </div>
      ) : (
        <div className={`grid gap-4 ${viewMode === 'cards' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
          {activeOrders.map(pedido => {
            const { min, sec, total } = getElapsed(pedido.hora_apertura);
            const timerColor = getTimerColor(total);
            const activeItems = itemsParaCocina(pedido).filter(i => i.estado !== 'entregado');

            return (
              <div
                key={pedido.id}
                className={`bg-white rounded-2xl border-2 overflow-hidden ${
                  activeItems.some(i => i.estado === 'listo')
                    ? 'border-emerald-300 shadow-emerald-50 shadow-lg'
                    : total > 900
                    ? 'border-red-300 shadow-red-50 shadow-lg'
                    : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setAbiertaId(pedido.id)}
                  aria-label={`Ver en grande la comanda de ${etiquetaPedido(pedido)}`}
                  className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left ${
                  activeItems.some(i => i.estado === 'listo') ? 'bg-emerald-50' : total > 900 ? 'bg-red-50' : 'bg-slate-50'
                }`}>
                  <div className="min-w-0">
                    <span className="text-lg font-bold text-slate-800">{etiquetaPedido(pedido)}</span>
                    {canalDe(pedido) === 'salon'
                      ? <span className="text-sm text-slate-500 ml-2">{pedido.empleado?.nombre}</span>
                      : <span className={`text-[11px] font-semibold ml-2 px-1.5 py-0.5 rounded ${colorCanal[canalDe(pedido)]}`}>{pedido.externo?.tipo_entrega === 'delivery_plataforma' ? 'Lo retira PedidosYa' : pedido.direccion_entrega ? 'Delivery' : 'Retira en el local'}</span>}
                    {pedido.observaciones && <p className="text-sm font-medium text-amber-700 mt-0.5">* {pedido.observaciones}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className={`flex items-center gap-1.5 font-mono font-bold ${timerColor}`}>
                      <Clock size={16} />
                      <span>{String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}</span>
                    </div>
                    <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                      <Maximize2 size={13} />Ver
                    </span>
                  </div>
                </button>

                <div className="p-4 space-y-2">
                  {itemsParaCocina(pedido).map(item => {
                    const cfg = estadoConfig[item.estado];
                    return (
                      <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl bg-slate-50">
                        <div className="flex-1 min-w-[10rem]">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg?.bg} ${cfg?.color}`}>{cfg?.label}</span>
                            <RelojItem item={item} />
                          </div>
                          <p className="mt-1 text-base font-semibold text-slate-800 break-words">
                            <span className="font-bold text-slate-900">{item.cantidad}×</span> {item.producto?.nombre}
                          </p>
                          <DetalleItem opciones={item.opciones} observaciones={item.observaciones} className="text-sm font-medium" />
                        </div>
                        {item.estado !== 'entregado' && (
                          <button
                            onClick={() => advanceItemState(pedido.id, item.id)}
                            className={`flex-shrink-0 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-all ${colorBoton(item.estado)}`}
                          >
                            {cfg?.action}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {abierta && (() => {
        const { min, sec, total } = getElapsed(abierta.hora_apertura);
        const items = itemsParaCocina(abierta);
        const quedanEnCocina = items.some(i => i.estado === 'pendiente' || i.estado === 'en_preparacion');
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-label={`Comanda de ${etiquetaPedido(abierta)}`}>
            <div className={`flex items-start justify-between gap-4 px-5 py-4 border-b ${total > 900 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="min-w-0">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">{etiquetaPedido(abierta)}</h2>
                <p className="mt-1 text-base text-slate-600">
                  {canalDe(abierta) === 'salon'
                    ? abierta.empleado?.nombre && `Moza/o: ${abierta.empleado.nombre}`
                    : abierta.externo?.tipo_entrega === 'delivery_plataforma' ? 'Lo retira PedidosYa' : abierta.direccion_entrega ? 'Delivery' : 'Retira en el local'}
                </p>
                {abierta.observaciones && (
                  <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-lg font-semibold text-amber-900">* {abierta.observaciones}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${getTimerColor(total)}`}>
                  <Clock size={22} />
                  {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
                </div>
                <button
                  type="button"
                  onClick={() => setAbiertaId(null)}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  aria-label="Cerrar"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {items.map(item => {
                const cfg = estadoConfig[item.estado];
                return (
                  <div key={item.id} className={`flex flex-wrap items-center gap-4 rounded-2xl border-2 p-4 ${item.estado === 'entregado' ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-3xl font-extrabold text-white">
                      {item.cantidad}
                    </span>
                    <div className="flex-1 min-w-[12rem]">
                      <p className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">{item.producto?.nombre}</p>
                      <DetalleItem opciones={item.opciones} observaciones={item.observaciones} className="text-lg sm:text-xl font-semibold" />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cfg?.bg} ${cfg?.color}`}>{cfg?.label}</span>
                        <RelojItem item={item} className="text-sm" />
                      </div>
                    </div>
                    {item.estado !== 'entregado' && (
                      <button
                        onClick={() => advanceItemState(abierta.id, item.id)}
                        className={`min-h-[64px] min-w-[10rem] px-6 rounded-2xl text-lg font-bold transition-all ${colorBoton(item.estado)}`}
                      >
                        {cfg?.action}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {quedanEnCocina && (
              <div className="border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => marcarTodoListo(abierta.id)}
                  className="w-full min-h-[64px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-xl font-bold text-white flex items-center justify-center gap-2"
                >
                  <Check size={24} />Marcar toda la comanda como lista
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
