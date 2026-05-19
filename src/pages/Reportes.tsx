import { useState } from 'react';
import { TrendingUp, DollarSign, ShoppingBag, Users, Clock, BarChart3, PieChart, ArrowUp, ArrowDown } from 'lucide-react';
import { mockVentasSemana, mockProductosMasVendidos } from '../lib/mockData';

type Periodo = 'dia' | 'semana' | 'mes';

const ventasMes = [
  { semana: 'Sem 1', ventas: 312400, pedidos: 152 },
  { semana: 'Sem 2', ventas: 298700, pedidos: 141 },
  { semana: 'Sem 3', ventas: 373200, pedidos: 174 },
  { semana: 'Sem 4', ventas: 372500, pedidos: 174 },
];

const ventasPorCategoria = [
  { categoria: 'Hamburguesas', ventas: 685200, pct: 42 },
  { categoria: 'Combos', ventas: 521400, pct: 32 },
  { categoria: 'Bebidas', ventas: 196800, pct: 12 },
  { categoria: 'Papas', ventas: 131200, pct: 8 },
  { categoria: 'Postres', ventas: 65600, pct: 4 },
  { categoria: 'Extras', ventas: 32800, pct: 2 },
];

const horariosPico = [
  { hora: '11-12', pedidos: 8 },
  { hora: '12-13', pedidos: 22 },
  { hora: '13-14', pedidos: 38 },
  { hora: '14-15', pedidos: 29 },
  { hora: '15-16', pedidos: 14 },
  { hora: '19-20', pedidos: 18 },
  { hora: '20-21', pedidos: 41 },
  { hora: '21-22', pedidos: 52 },
  { hora: '22-23', pedidos: 38 },
  { hora: '23-24', pedidos: 18 },
];

const colores = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reportes() {
  const [periodo, setPeriodo] = useState<Periodo>('semana');

  const datosVentas = periodo === 'semana' ? mockVentasSemana.map(d => ({ label: d.dia, valor: d.ventas, pedidos: d.pedidos })) : ventasMes.map(d => ({ label: d.semana, valor: d.ventas, pedidos: d.pedidos }));
  const maxVenta = Math.max(...datosVentas.map(d => d.valor));

  const totalVentas = datosVentas.reduce((s, d) => s + d.valor, 0);
  const totalPedidos = datosVentas.reduce((s, d) => s + d.pedidos, 0);
  const ticketPromedio = totalPedidos > 0 ? Math.round(totalVentas / totalPedidos) : 0;

  const costoEstimado = totalVentas * 0.47;
  const gananciaBruta = totalVentas - costoEstimado;
  const margenBruto = ((gananciaBruta / totalVentas) * 100).toFixed(1);

  const maxHorario = Math.max(...horariosPico.map(h => h.pedidos));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800">Reportes y Estadísticas</h2>
          <p className="text-sm text-slate-500">Análisis completo del negocio</p>
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {(['dia', 'semana', 'mes'] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                periodo === p ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Ventas Totales" value={`$${(totalVentas / 1000).toFixed(0)}k`} sub="+" change="+14% vs anterior" positive />
        <MetricCard label="Pedidos" value={String(totalPedidos)} sub="pedidos" change="+11% vs anterior" positive />
        <MetricCard label="Ticket Promedio" value={`$${ticketPromedio.toLocaleString()}`} sub="por pedido" change="+3% vs anterior" positive />
        <MetricCard label="Margen Bruto" value={`${margenBruto}%`} sub="rentabilidad" change="+2.1pp" positive />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-800">Evolución de Ventas</h3>
              <p className="text-sm text-slate-500 capitalize">{periodo === 'semana' ? 'Esta semana' : 'Este mes'}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-slate-800">${(totalVentas / 1000).toFixed(1)}k</p>
              <p className="text-xs text-emerald-600 flex items-center justify-end gap-0.5"><ArrowUp size={10} /> +14%</p>
            </div>
          </div>
          <div className="flex items-end gap-3 h-44">
            {datosVentas.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs text-slate-500">${(d.valor / 1000).toFixed(0)}k</span>
                <div
                  className="w-full rounded-t-xl bg-amber-500 hover:bg-amber-400 transition-all cursor-pointer relative group"
                  style={{ height: `${(d.valor / maxVenta) * 100}%`, minHeight: '12px' }}
                >
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div>{d.pedidos} pedidos</div>
                    <div className="font-bold">${d.valor.toLocaleString()}</div>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Ventas por Categoría</h3>
          <p className="text-sm text-slate-500 mb-4">Distribución del ingreso</p>
          <div className="space-y-3">
            {ventasPorCategoria.map((cat, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: colores[i] }} />
                    <span className="text-slate-700 font-medium">{cat.categoria}</span>
                  </div>
                  <span className="text-slate-500">{cat.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${cat.pct}%`, background: colores[i] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Horarios de Mayor Movimiento</h3>
          <p className="text-sm text-slate-500 mb-4">Pedidos por franja horaria (promedio semana)</p>
          <div className="flex items-end gap-1.5 h-32">
            {horariosPico.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md transition-all hover:opacity-80 cursor-pointer"
                  style={{
                    height: `${(h.pedidos / maxHorario) * 100}%`,
                    minHeight: '4px',
                    background: h.pedidos === maxHorario ? '#f59e0b' : h.pedidos > maxHorario * 0.7 ? '#fb923c' : '#94a3b8'
                  }}
                  title={`${h.hora}: ${h.pedidos} pedidos`}
                />
                <span className="text-xs text-slate-400" style={{ fontSize: '9px' }}>{h.hora.split('-')[0]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
            Pico máximo: 21-22hs con 52 pedidos promedio
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Top Productos</h3>
          <p className="text-sm text-slate-500 mb-4">Más vendidos de la semana</p>
          <div className="space-y-3">
            {mockProductosMasVendidos.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : 'bg-orange-200 text-orange-700'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-slate-800 truncate">{p.nombre}</span>
                    <span className="text-sm font-bold text-slate-700 ml-2">${p.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden mr-2 mt-1">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${(p.cantidad / mockProductosMasVendidos[0].cantidad) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{p.cantidad} uds</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Desglose Financiero</h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-600">Ingresos brutos</span>
              <span className="font-bold text-slate-800">${totalVentas.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-600">Costos de producción (~47%)</span>
              <span className="text-red-500 font-medium">-${costoEstimado.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Ganancia bruta</span>
              <span className="font-bold text-emerald-600">${gananciaBruta.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-slate-600">Margen bruto</span>
              <span className="font-bold text-2xl text-emerald-600">{margenBruto}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Métodos de Pago</h3>
          <div className="space-y-3">
            {[
              { metodo: 'Efectivo', pct: 45, color: 'bg-emerald-500' },
              { metodo: 'Débito', pct: 28, color: 'bg-blue-500' },
              { metodo: 'Transferencia', pct: 18, color: 'bg-purple-500' },
              { metodo: 'Crédito', pct: 9, color: 'bg-orange-500' },
            ].map((m, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{m.metodo}</span>
                  <span className="font-semibold text-slate-700">{m.pct}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Rendimiento de Mozas</h3>
          <div className="space-y-3">
            {[
              { nombre: 'María López', ventas: 198400, pedidos: 48, color: 'bg-amber-500' },
              { nombre: 'Laura García', ventas: 175200, pedidos: 41, color: 'bg-blue-500' },
              { nombre: 'Ana Rodríguez', ventas: 142300, pedidos: 35, color: 'bg-emerald-500' },
            ].map((e, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-slate-700 truncate">{e.nombre}</span>
                    <span className="text-sm font-bold text-slate-800">${(e.ventas / 1000).toFixed(0)}k</span>
                  </div>
                  <span className="text-xs text-slate-400">{e.pedidos} pedidos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, change, positive }: { label: string; value: string; sub: string; change: string; positive: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
        {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        <span>{change}</span>
      </div>
    </div>
  );
}
