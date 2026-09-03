import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { Pedido } from '../lib/types';
import { loadDemoPedidos } from '../lib/demoStore';
import { loadCajasDiarias } from '../lib/cajaStore';
import { categoriasIniciales } from '../lib/mockData';
import { useProductos } from '../lib/productosStore';
import { useUsuarios } from '../lib/usuariosStore';

type Periodo = 'dia' | 'semana' | 'mes';

const nombresDias = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const colores = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

const esVenta = (pedido: Pedido) => pedido.estado !== 'cancelado';

const inicioDelDia = (fecha: Date) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function Reportes() {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const productos = useProductos();
  const usuarios = useUsuarios();
  const todosLosPedidos = useMemo(() => loadDemoPedidos().filter(esVenta), []);
  const cajas = useMemo(() => loadCajasDiarias(), []);

  const diasDelPeriodo = periodo === 'dia' ? 1 : periodo === 'semana' ? 7 : 30;

  const pedidos = useMemo(() => {
    const desde = inicioDelDia(new Date());
    desde.setDate(desde.getDate() - (diasDelPeriodo - 1));
    return todosLosPedidos.filter(p => new Date(p.created_at) >= desde);
  }, [todosLosPedidos, diasDelPeriodo]);

  const datosVentas = useMemo(() => {
    if (periodo === 'mes') {
      const semanas = Array.from({ length: 4 }, (_, i) => ({
        label: `Sem ${i + 1}`,
        valor: 0,
        pedidos: 0,
        desde: (() => {
          const d = inicioDelDia(new Date());
          d.setDate(d.getDate() - (27 - i * 7));
          return d;
        })(),
      }));

      pedidos.forEach(pedido => {
        const fecha = new Date(pedido.created_at);
        const indice = semanas.reduce((acc, semana, i) => (fecha >= semana.desde ? i : acc), 0);
        semanas[indice].valor += pedido.total;
        semanas[indice].pedidos += 1;
      });

      return semanas.map(({ label, valor, pedidos }) => ({ label, valor, pedidos }));
    }

    const dias = Array.from({ length: diasDelPeriodo }, (_, i) => {
      const fecha = inicioDelDia(new Date());
      fecha.setDate(fecha.getDate() - (diasDelPeriodo - 1 - i));
      return {
        label: periodo === 'dia' ? 'Hoy' : nombresDias[fecha.getDay()],
        fecha,
        valor: 0,
        pedidos: 0,
      };
    });

    pedidos.forEach(pedido => {
      const fecha = inicioDelDia(new Date(pedido.created_at)).getTime();
      const dia = dias.find(d => d.fecha.getTime() === fecha);
      if (!dia) return;
      dia.valor += pedido.total;
      dia.pedidos += 1;
    });

    return dias.map(({ label, valor, pedidos }) => ({ label, valor, pedidos }));
  }, [pedidos, periodo, diasDelPeriodo]);

  const maxVenta = Math.max(...datosVentas.map(d => d.valor), 1);
  const totalVentas = datosVentas.reduce((s, d) => s + d.valor, 0);
  const totalPedidos = datosVentas.reduce((s, d) => s + d.pedidos, 0);
  const ticketPromedio = totalPedidos > 0 ? Math.round(totalVentas / totalPedidos) : 0;

  const costoTotal = useMemo(() => {
    return pedidos.reduce((suma, pedido) => {
      const costoPedido = (pedido.items || [])
        .filter(item => item.estado !== 'cancelado')
        .reduce((s, item) => {
          const producto = productos.find(p => p.id === item.producto_id) || item.producto;
          return s + item.cantidad * (producto?.costo_produccion || 0);
        }, 0);
      return suma + costoPedido;
    }, 0);
  }, [pedidos, productos]);

  const gananciaBruta = totalVentas - costoTotal;
  const margenBruto = totalVentas > 0 ? ((gananciaBruta / totalVentas) * 100).toFixed(1) : '0.0';

  const ventasPorCategoria = useMemo(() => {
    const acumulado = new Map<string, number>();

    pedidos.forEach(pedido => {
      (pedido.items || [])
        .filter(item => item.estado !== 'cancelado')
        .forEach(item => {
          const producto = productos.find(p => p.id === item.producto_id) || item.producto;
          const categoria =
            categoriasIniciales.find(c => c.id === producto?.categoria_id)?.nombre || 'Sin categoría';
          acumulado.set(categoria, (acumulado.get(categoria) || 0) + item.subtotal);
        });
    });

    const total = [...acumulado.values()].reduce((s, v) => s + v, 0);

    return [...acumulado.entries()]
      .map(([categoria, ventas]) => ({
        categoria,
        ventas,
        pct: total > 0 ? Math.round((ventas / total) * 100) : 0,
      }))
      .sort((a, b) => b.ventas - a.ventas);
  }, [pedidos, productos]);

  const horariosPico = useMemo(() => {
    const franjas = new Map<number, number>();
    pedidos.forEach(pedido => {
      const hora = new Date(pedido.created_at).getHours();
      franjas.set(hora, (franjas.get(hora) || 0) + 1);
    });
    return [...franjas.entries()]
      .map(([hora, cantidad]) => ({ hora: `${hora}-${hora + 1}`, pedidos: cantidad }))
      .sort((a, b) => parseInt(a.hora) - parseInt(b.hora));
  }, [pedidos]);

  const maxHorario = Math.max(...horariosPico.map(h => h.pedidos), 1);
  const franjaPico = horariosPico.reduce<{ hora: string; pedidos: number } | null>(
    (mejor, actual) => (!mejor || actual.pedidos > mejor.pedidos ? actual : mejor),
    null
  );

  const topProductos = useMemo(() => {
    const acumulado = new Map<string, { nombre: string; cantidad: number; total: number }>();

    pedidos.forEach(pedido => {
      (pedido.items || [])
        .filter(item => item.estado !== 'cancelado')
        .forEach(item => {
          const nombre = item.producto?.nombre
            || productos.find(p => p.id === item.producto_id)?.nombre
            || 'Producto';
          const actual = acumulado.get(item.producto_id) || { nombre, cantidad: 0, total: 0 };
          actual.cantidad += item.cantidad;
          actual.total += item.subtotal;
          acumulado.set(item.producto_id, actual);
        });
    });

    return [...acumulado.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
  }, [pedidos, productos]);

  const metodosPago = useMemo(() => {
    const desde = inicioDelDia(new Date());
    desde.setDate(desde.getDate() - (diasDelPeriodo - 1));

    const totales = cajas
      .filter(caja => new Date(caja.fecha) >= desde)
      .reduce(
        (acc, caja) => ({
          efectivo: acc.efectivo + caja.efectivo,
          tarjeta: acc.tarjeta + caja.tarjeta,
          transferencia: acc.transferencia + caja.transferencia,
        }),
        { efectivo: 0, tarjeta: 0, transferencia: 0 }
      );

    const total = totales.efectivo + totales.tarjeta + totales.transferencia;

    return [
      { metodo: 'Efectivo', monto: totales.efectivo, color: 'bg-emerald-500' },
      { metodo: 'Tarjeta', monto: totales.tarjeta, color: 'bg-blue-500' },
      { metodo: 'Transferencia', monto: totales.transferencia, color: 'bg-purple-500' },
    ]
      .filter(m => m.monto > 0)
      .map(m => ({ ...m, pct: total > 0 ? Math.round((m.monto / total) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [cajas, diasDelPeriodo]);

  const rendimientoMozas = useMemo(() => {
    const acumulado = new Map<string, { nombre: string; ventas: number; pedidos: number }>();

    pedidos.forEach(pedido => {
      if (!pedido.empleado_id) return;
      const perfil = usuarios.find(u => u.id === pedido.empleado_id) || pedido.empleado;
      const nombre = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : 'Sin asignar';
      const actual = acumulado.get(pedido.empleado_id) || { nombre, ventas: 0, pedidos: 0 };
      actual.ventas += pedido.total;
      actual.pedidos += 1;
      acumulado.set(pedido.empleado_id, actual);
    });

    const estilos = ['bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500'];

    return [...acumulado.values()]
      .sort((a, b) => b.ventas - a.ventas)
      .map((e, i) => ({ ...e, color: estilos[i % estilos.length] }));
  }, [pedidos, usuarios]);

  if (todosLosPedidos.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-slate-800">Reportes y Estadísticas</h2>
          <p className="text-sm text-slate-500">Análisis completo del negocio</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BarChart3 size={36} className="mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-800">Todavía no hay ventas para analizar</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-lg mx-auto">
            Los reportes se arman con las comandas que vayas cobrando. En cuanto registres la primera
            venta vas a ver acá la evolución, el ticket promedio, el margen y los productos que más
            salen.
          </p>
        </div>
      </div>
    );
  }

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
        <MetricCard label="Ventas Totales" value={`$${totalVentas.toLocaleString('es-AR')}`} sub="ingresos" />
        <MetricCard label="Comandas" value={String(totalPedidos)} sub="comandas" />
        <MetricCard label="Ticket Promedio" value={`$${ticketPromedio.toLocaleString('es-AR')}`} sub="por comanda" />
        <MetricCard label="Margen Bruto" value={`${margenBruto}%`} sub="rentabilidad" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-800">Evolución de Ventas</h3>
              <p className="text-sm text-slate-500">
                {periodo === 'dia' ? 'Hoy' : periodo === 'semana' ? 'Esta semana' : 'Este mes'}
              </p>
            </div>
            <p className="text-xl font-bold text-slate-800">${totalVentas.toLocaleString('es-AR')}</p>
          </div>
          <div className="flex items-end gap-3 h-44">
            {datosVentas.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs text-slate-500">
                  {d.valor > 0 ? `$${(d.valor / 1000).toFixed(0)}k` : ''}
                </span>
                <div
                  className="w-full rounded-t-xl bg-amber-500 hover:bg-amber-400 transition-all cursor-pointer relative group"
                  style={{ height: `${(d.valor / maxVenta) * 100}%`, minHeight: '4px' }}
                >
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div>{d.pedidos} comandas</div>
                    <div className="font-bold">${d.valor.toLocaleString('es-AR')}</div>
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
          {ventasPorCategoria.length > 0 ? (
            <div className="space-y-3">
              {ventasPorCategoria.map((cat, i) => (
                <div key={cat.categoria}>
                  <div className="flex justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: colores[i % colores.length] }} />
                      <span className="text-slate-700 font-medium">{cat.categoria}</span>
                    </div>
                    <span className="text-slate-500">{cat.pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${cat.pct}%`, background: colores[i % colores.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin ventas en este período.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Horarios de Mayor Movimiento</h3>
          <p className="text-sm text-slate-500 mb-4">Comandas por franja horaria</p>
          {horariosPico.length > 0 ? (
            <>
              <div className="flex items-end gap-1.5 h-32">
                {horariosPico.map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md transition-all hover:opacity-80 cursor-pointer"
                      style={{
                        height: `${(h.pedidos / maxHorario) * 100}%`,
                        minHeight: '4px',
                        background: h.pedidos === maxHorario ? '#f59e0b' : h.pedidos > maxHorario * 0.7 ? '#fb923c' : '#94a3b8',
                      }}
                      title={`${h.hora}: ${h.pedidos} comandas`}
                    />
                    <span className="text-xs text-slate-400" style={{ fontSize: '9px' }}>{h.hora.split('-')[0]}</span>
                  </div>
                ))}
              </div>
              {franjaPico && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                  Pico máximo: {franjaPico.hora}hs con {franjaPico.pedidos} comandas
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">Sin comandas en este período.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Top Productos</h3>
          <p className="text-sm text-slate-500 mb-4">Los más vendidos del período</p>
          {topProductos.length > 0 ? (
            <div className="space-y-3">
              {topProductos.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : 'bg-orange-200 text-orange-700'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-slate-800 truncate">{p.nombre}</span>
                      <span className="text-sm font-bold text-slate-700 ml-2">${p.total.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden mr-2 mt-1">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${(p.cantidad / (topProductos[0].cantidad || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{p.cantidad} uds</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin ventas en este período.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Desglose Financiero</h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-600">Ingresos brutos</span>
              <span className="font-bold text-slate-800">${totalVentas.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-600">Costos de producción</span>
              <span className="text-red-500 font-medium">-${Math.round(costoTotal).toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Ganancia bruta</span>
              <span className="font-bold text-emerald-600">${Math.round(gananciaBruta).toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-slate-600">Margen bruto</span>
              <span className="font-bold text-2xl text-emerald-600">{margenBruto}%</span>
            </div>
          </div>
          {costoTotal === 0 && (
            <p className="text-xs text-slate-400 mt-3">
              Cargá las recetas de tus productos para que el costo se calcule solo.
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Métodos de Pago</h3>
          {metodosPago.length > 0 ? (
            <div className="space-y-3">
              {metodosPago.map((m, i) => (
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
          ) : (
            <p className="text-sm text-slate-400">Todavía no registraste cobros en este período.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Rendimiento de Mozas</h3>
          {rendimientoMozas.length > 0 ? (
            <div className="space-y-3">
              {rendimientoMozas.map((e, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-slate-700 truncate">{e.nombre}</span>
                      <span className="text-sm font-bold text-slate-800">${e.ventas.toLocaleString('es-AR')}</span>
                    </div>
                    <span className="text-xs text-slate-400">{e.pedidos} comandas</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin comandas asignadas en este período.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
