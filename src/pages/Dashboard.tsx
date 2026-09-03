import { TrendingUp, DollarSign, UtensilsCrossed, ShoppingBag, Clock, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { mockMesas, mockVentasSemana, mockProductosMasVendidos, mockIngredientes } from '../lib/mockData';

const estadoColors: Record<string, string> = {
  libre: 'bg-emerald-100 text-emerald-700',
  ocupada: 'bg-blue-100 text-blue-700',
  esperando_pedido: 'bg-yellow-100 text-yellow-700',
  en_preparacion: 'bg-orange-100 text-orange-700',
  servida: 'bg-purple-100 text-purple-700',
  pendiente_cobro: 'bg-red-100 text-red-700',
  cerrada: 'bg-slate-100 text-slate-600',
};

const estadoLabels: Record<string, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  esperando_pedido: 'Esperando',
  en_preparacion: 'En prep.',
  servida: 'Servida',
  pendiente_cobro: 'Por cobrar',
  cerrada: 'Cerrada',
};

export default function Dashboard() {
  const mesasOcupadas = mockMesas.filter(m => m.estado !== 'libre' && m.estado !== 'cerrada').length;
  const mesasLibres = mockMesas.filter(m => m.estado === 'libre').length;
  const alertasStock = mockIngredientes.filter(i => i.stock_actual <= i.stock_minimo).length;
  const maxVenta = Math.max(...mockVentasSemana.map(v => v.ventas));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Ventas del Día"
          value="$67.400"
          sub="+12% vs ayer"
          icon={DollarSign}
          color="amber"
          trend="up"
        />
        <StatCard
          label="Comandas Hoy"
          value="31"
          sub="6 en curso"
          icon={ShoppingBag}
          color="blue"
          trend="up"
        />
        <StatCard
          label="Mesas Activas"
          value={`${mesasOcupadas}/${mockMesas.length}`}
          sub={`${mesasLibres} libres`}
          icon={UtensilsCrossed}
          color="green"
          trend="neutral"
        />
        <StatCard
          label="Alertas Stock"
          value={String(alertasStock)}
          sub="Insumos bajos"
          icon={AlertTriangle}
          color="red"
          trend={alertasStock > 0 ? 'down' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-800">Ventas de la Semana</h3>
              <p className="text-sm text-slate-500">Ingresos y comandas por día</p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-xs font-medium px-2.5 py-1 rounded-full">
              <TrendingUp size={12} />
              <span>+18% semanal</span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-36">
            {mockVentasSemana.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-slate-500 font-medium">${(d.ventas / 1000).toFixed(0)}k</span>
                <div className="w-full rounded-t-md bg-amber-500/90 hover:bg-amber-500 transition-all duration-200 cursor-pointer relative group"
                  style={{ height: `${(d.ventas / maxVenta) * 100}%`, minHeight: '8px' }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {d.pedidos} comandas
                  </div>
                </div>
                <span className="text-xs text-slate-500">{d.dia}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Estado de Mesas</h3>
          <p className="text-sm text-slate-500 mb-4">Resumen actual del local</p>
          <div className="space-y-2">
            {Object.entries(estadoLabels).map(([estado, label]) => {
              const count = mockMesas.filter(m => m.estado === estado).length;
              if (count === 0) return null;
              return (
                <div key={estado} className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadoColors[estado]}`}>{label}</span>
                  <span className="text-sm font-semibold text-slate-700">{count} mesas</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Productos Más Vendidos</h3>
          <p className="text-sm text-slate-500 mb-4">Esta semana</p>
          <div className="space-y-3">
            {mockProductosMasVendidos.map((p, i) => {
              const maxQty = mockProductosMasVendidos[0].cantidad;
              return (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                      <span className="text-sm font-medium text-slate-700">{p.nombre}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-600">{p.cantidad} uds</span>
                      <span className="text-xs text-slate-400 ml-2">${p.total.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${(p.cantidad / maxQty) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Alertas de Stock</h3>
          <p className="text-sm text-slate-500 mb-4">Insumos por debajo del mínimo</p>
          <div className="space-y-3">
            {mockIngredientes
              .filter(i => i.stock_actual <= i.stock_minimo * 1.5)
              .slice(0, 6)
              .map(ing => {
                const pct = Math.round((ing.stock_actual / ing.stock_minimo) * 100);
                const isLow = ing.stock_actual <= ing.stock_minimo;
                return (
                  <div key={ing.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isLow ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <span className="text-sm text-slate-700 truncate">{ing.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{ing.stock_actual} {ing.unidad_medida}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isLow ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Rendimiento por Empleado (Semana)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleada</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Comandas</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ventas</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Promedio/mesa</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ranking</th>
              </tr>
            </thead>
            <tbody>
              {[
                { nombre: 'María López', pedidos: 48, ventas: 198400, promedio: 4133 },
                { nombre: 'Laura García', pedidos: 41, ventas: 175200, promedio: 4273 },
                { nombre: 'Ana Rodríguez', pedidos: 35, ventas: 142300, promedio: 4066 },
              ].map((emp, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-medium text-slate-700">{emp.nombre}</td>
                  <td className="py-3 px-3 text-right text-slate-600">{emp.pedidos}</td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-800">${emp.ventas.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-slate-600">${emp.promedio.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'}`}>
                      #{i + 1}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  color: 'amber' | 'blue' | 'green' | 'red';
  trend: 'up' | 'down' | 'neutral';
}

function StatCard({ label, value, sub, icon: Icon, color, trend }: StatCardProps) {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    red: 'bg-red-50 text-red-600 border-red-100',
  };
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-500';
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Clock;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon size={12} />
          <span>{sub}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
