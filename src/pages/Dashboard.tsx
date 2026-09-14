import { useMemo } from 'react';
import { DollarSign, UtensilsCrossed, ShoppingBag, Clock, AlertTriangle, ArrowUp, ArrowDown, LayoutDashboard } from 'lucide-react';
import type { Pedido } from '../lib/types';
import { useIngredientes, usePedidos, useProducciones } from '../lib/demoStore';
import { calcularCostoProducto } from '../lib/costosReceta';
import { estadoOperativoMesa, useMesas } from '../lib/mesasStore';
import { useProductos } from '../lib/productosStore';
import { useUsuarios } from '../lib/usuariosStore';

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

const nombresDias = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const esMismoDia = (fecha: string, referencia: Date) => {
  const d = new Date(fecha);
  return (
    d.getDate() === referencia.getDate() &&
    d.getMonth() === referencia.getMonth() &&
    d.getFullYear() === referencia.getFullYear()
  );
};

const esVenta = (pedido: Pedido) => pedido.estado === 'cobrado' || pedido.estado === 'cuenta_corriente';

export default function Dashboard() {
  const mesas = useMesas();
  const usuarios = useUsuarios();
  const pedidos = usePedidos();
  const ingredientes = useIngredientes();
  const producciones = useProducciones();
  const productos = useProductos();

  const hoy = new Date();
  const pedidosHoy = pedidos.filter(p => esMismoDia(p.created_at, hoy));
  const ventasHoyPedidos = pedidos.filter(p => esVenta(p) && esMismoDia(p.hora_cierre || p.created_at, hoy));
  const ventasHoy = ventasHoyPedidos.reduce((s, p) => s + p.total, 0);
  const costoInsumo = (id: string) => ingredientes.find(i => i.id === id)?.costo_por_unidad || 0;
  const costoHoy = ventasHoyPedidos.reduce((suma, pedido) => (
    suma + (pedido.items || []).filter(item => item.estado !== 'cancelado').reduce((s, item) => {
      const producto = productos.find(p => p.id === item.producto_id) || item.producto;
      return s + item.cantidad * (producto ? calcularCostoProducto(producto, costoInsumo, producciones) : 0);
    }, 0)
  ), 0);
  const margenHoy = ventasHoy > 0 ? ((ventasHoy - costoHoy) / ventasHoy) * 100 : 0;
  const comandasEnCurso = pedidosHoy.filter(p => p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado').length;

  const mesasVista = mesas.map(mesa => ({ ...mesa, estado: estadoOperativoMesa(mesa, pedidos) }));
  const mesasOcupadas = mesasVista.filter(m => m.estado !== 'libre' && m.estado !== 'cerrada').length;
  const mesasLibres = mesasVista.filter(m => m.estado === 'libre').length;
  const alertasStock = ingredientes.filter(i => i.stock_actual <= i.stock_minimo).length;

  const ventasSemana = useMemo(() => {
    const dias = Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - (6 - i));
      return { fecha, dia: nombresDias[fecha.getDay()], ventas: 0, pedidos: 0 };
    });

    pedidos.filter(esVenta).forEach(pedido => {
      const dia = dias.find(d => esMismoDia(pedido.hora_cierre || pedido.created_at, d.fecha));
      if (!dia) return;
      dia.ventas += pedido.total;
      dia.pedidos += 1;
    });

    return dias;
  }, [pedidos]);

  const maxVenta = Math.max(...ventasSemana.map(v => v.ventas), 1);
  const hayVentas = ventasSemana.some(v => v.ventas > 0);

  const productosMasVendidos = useMemo(() => {
    const acumulado = new Map<string, { nombre: string; cantidad: number; total: number }>();

    pedidos.filter(esVenta).forEach(pedido => {
      (pedido.items || [])
        .filter(item => item.estado !== 'cancelado')
        .forEach(item => {
          const nombre = item.producto?.nombre || 'Producto';
          const actual = acumulado.get(item.producto_id) || { nombre, cantidad: 0, total: 0 };
          actual.cantidad += item.cantidad;
          actual.total += item.subtotal;
          acumulado.set(item.producto_id, actual);
        });
    });

    return [...acumulado.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
  }, [pedidos]);

  const rendimientoEmpleados = useMemo(() => {
    const acumulado = new Map<string, { nombre: string; pedidos: number; ventas: number }>();

    pedidos.filter(esVenta).forEach(pedido => {
      if (!pedido.empleado_id) return;
      const perfil = usuarios.find(u => u.id === pedido.empleado_id) || pedido.empleado;
      const nombre = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : 'Sin asignar';
      const actual = acumulado.get(pedido.empleado_id) || { nombre, pedidos: 0, ventas: 0 };
      actual.pedidos += 1;
      actual.ventas += pedido.total;
      acumulado.set(pedido.empleado_id, actual);
    });

    return [...acumulado.values()]
      .map(e => ({ ...e, promedio: e.pedidos > 0 ? Math.round(e.ventas / e.pedidos) : 0 }))
      .sort((a, b) => b.ventas - a.ventas);
  }, [pedidos, usuarios]);

  const sinDatos = mesas.length === 0 && pedidos.length === 0 && ingredientes.length === 0;

  if (sinDatos) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <LayoutDashboard size={36} className="mx-auto text-slate-300 mb-3" />
        <h3 className="font-semibold text-slate-800">Tu sistema está listo para empezar</h3>
        <p className="text-sm text-slate-500 mt-1.5 max-w-lg mx-auto">
          Todavía no hay movimientos. A medida que cargues las mesas de tu local, tu carta de
          productos y tus insumos, y empieces a tomar comandas, acá vas a ver las ventas del día,
          el estado de las mesas y las alertas de stock.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-500">
          <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">1. Cargá tu personal en Usuarios</span>
          <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">2. Armá el salón en Mesas</span>
          <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">3. Cargá insumos en Stock</span>
          <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">4. Cargá tu carta en Productos</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Ventas del Día"
          value={`$${ventasHoy.toLocaleString('es-AR')}`}
          sub={`${pedidosHoy.length} comandas · margen ${margenHoy.toFixed(0)}%`}
          icon={DollarSign}
          color="amber"
          trend="neutral"
        />
        <StatCard
          label="Comandas Hoy"
          value={String(pedidosHoy.length)}
          sub={`${comandasEnCurso} en curso`}
          icon={ShoppingBag}
          color="blue"
          trend="neutral"
        />
        <StatCard
          label="Mesas Activas"
          value={`${mesasOcupadas}/${mesas.length}`}
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
          <div className="mb-5">
            <h3 className="font-semibold text-slate-800">Ventas de la Semana</h3>
            <p className="text-sm text-slate-500">Ingresos y comandas por día</p>
          </div>
          {hayVentas ? (
            <div className="flex items-end gap-2 h-36">
              {ventasSemana.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500 font-medium">
                    {d.ventas > 0 ? `$${(d.ventas / 1000).toFixed(0)}k` : ''}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-amber-500/90 hover:bg-amber-500 transition-all duration-200 cursor-pointer relative group"
                    style={{ height: `${(d.ventas / maxVenta) * 100}%`, minHeight: '4px' }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {d.pedidos} comandas
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{d.dia}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-sm text-slate-400">
              Cuando cierres tus primeras comandas vas a ver la evolución acá
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Estado de Mesas</h3>
          <p className="text-sm text-slate-500 mb-4">Resumen actual del local</p>
          {mesas.length > 0 ? (
            <div className="space-y-2">
              {Object.entries(estadoLabels).map(([estado, label]) => {
                const count = mesasVista.filter(m => m.estado === estado).length;
                if (count === 0) return null;
                return (
                  <div key={estado} className="flex items-center justify-between">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadoColors[estado]}`}>{label}</span>
                    <span className="text-sm font-semibold text-slate-700">{count} mesas</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Todavía no cargaste las mesas del local.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Productos Más Vendidos</h3>
          <p className="text-sm text-slate-500 mb-4">Esta semana</p>
          {productosMasVendidos.length > 0 ? (
            <div className="space-y-3">
              {productosMasVendidos.map((p, i) => {
                const maxQty = productosMasVendidos[0].cantidad || 1;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                        <span className="text-sm font-medium text-slate-700">{p.nombre}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-600">{p.cantidad} uds</span>
                        <span className="text-xs text-slate-400 ml-2">${p.total.toLocaleString('es-AR')}</span>
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
          ) : (
            <p className="text-sm text-slate-400">Sin ventas registradas todavía.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Alertas de Stock</h3>
          <p className="text-sm text-slate-500 mb-4">Insumos por debajo del mínimo</p>
          {ingredientes.length > 0 ? (
            <div className="space-y-3">
              {ingredientes
                .filter(i => i.stock_actual <= i.stock_minimo * 1.5)
                .slice(0, 6)
                .map(ing => {
                  const pct = ing.stock_minimo > 0 ? Math.round((ing.stock_actual / ing.stock_minimo) * 100) : 100;
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
              {ingredientes.filter(i => i.stock_actual <= i.stock_minimo * 1.5).length === 0 && (
                <p className="text-sm text-slate-400">Todos los insumos están por encima del mínimo.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Todavía no cargaste insumos en Stock.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Rendimiento por Empleado (Semana)</h3>
        {rendimientoEmpleados.length > 0 ? (
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
                {rendimientoEmpleados.map((emp, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-medium text-slate-700">{emp.nombre}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{emp.pedidos}</td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-800">${emp.ventas.toLocaleString('es-AR')}</td>
                    <td className="py-3 px-3 text-right text-slate-600">${emp.promedio.toLocaleString('es-AR')}</td>
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
        ) : (
          <p className="text-sm text-slate-400">
            Cuando tus mozas empiecen a tomar comandas vas a poder comparar su rendimiento acá.
          </p>
        )}
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
