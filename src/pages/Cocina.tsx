import { useState, useEffect } from 'react';
import { Clock, Check, ChefHat, Bell, AlertCircle } from 'lucide-react';
import type { Pedido, EstadoItem } from '../lib/types';
import { loadDemoPedidos, saveDemoPedidos, usePedidos } from '../lib/demoStore';

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
        return { ...item, estado: next };
      });
      const allDone = items?.every(i => i.estado === 'entregado' || i.estado === 'cancelado');
      const allReady = items?.every(i => i.estado === 'listo' || i.estado === 'entregado' || i.estado === 'cancelado');
      return {
        ...p,
        items,
        estado: allDone ? 'entregado' : allReady ? 'listo' : p.estado,
      } as Pedido;
    }));
  };

  const enCocina = pedidos.filter(p =>
    p.estado !== 'abierto' && p.estado !== 'entregado' && p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado'
  );
  const activeOrders = enCocina.filter(p => (p.items || []).some(i => i.estado !== 'entregado' && i.estado !== 'cancelado'));
  const pendingItems = enCocina.flatMap(p => (p.items || []).filter(i => i.estado === 'pendiente')).length;
  const inProgressItems = enCocina.flatMap(p => (p.items || []).filter(i => i.estado === 'en_preparacion')).length;
  const readyItems = enCocina.flatMap(p => (p.items || []).filter(i => i.estado === 'listo')).length;

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
            const activeItems = pedido.items?.filter(i => i.estado !== 'entregado' && i.estado !== 'cancelado') || [];

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
                <div className={`px-4 py-3 flex items-center justify-between ${
                  activeItems.some(i => i.estado === 'listo') ? 'bg-emerald-50' : total > 900 ? 'bg-red-50' : 'bg-slate-50'
                }`}>
                  <div>
                    <span className="font-bold text-slate-800">Mesa {pedido.mesa?.numero}</span>
                    <span className="text-sm text-slate-500 ml-2">{pedido.empleado?.nombre}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 font-mono font-bold text-sm ${timerColor}`}>
                    <Clock size={14} />
                    <span>{String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}</span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {(pedido.items || []).filter(i => i.estado !== 'cancelado').map(item => {
                    const cfg = estadoConfig[item.estado];
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                        <div className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg?.bg} ${cfg?.color}`}>
                          {cfg?.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">x{item.cantidad}</span>
                            <span className="text-sm font-medium text-slate-800 truncate">{item.producto?.nombre}</span>
                          </div>
                          {item.observaciones && (
                            <p className="text-xs text-amber-600 mt-0.5 truncate">* {item.observaciones}</p>
                          )}
                        </div>
                        {item.estado !== 'entregado' && (
                          <button
                            onClick={() => advanceItemState(pedido.id, item.id)}
                            className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              item.estado === 'pendiente'
                                ? 'bg-orange-500 hover:bg-orange-400 text-white'
                                : item.estado === 'en_preparacion'
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                                : item.estado === 'listo'
                                ? 'bg-blue-500 hover:bg-blue-400 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
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
    </div>
  );
}
