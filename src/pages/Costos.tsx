import { useEffect, useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Plus, Trash2, ChevronDown, AlertCircle } from 'lucide-react';
import type { Producto, RecetaItem, Ingrediente } from '../lib/types';
import { useProductos } from '../lib/productosStore';
import { loadDemoIngredientes } from '../lib/demoStore';

interface RecetaCalc {
  receta: (RecetaItem & { ingrediente: Ingrediente })[];
  costoTotal: number;
  margenBruto: number;
  margenPct: number;
  ganancia: number;
  precioMinimo: number;
  precioIdeal: number;
}

function calcularReceta(receta: RecetaItem[], precio: number, insumos: Ingrediente[]): RecetaCalc {
  const items = receta
    .map(r => {
      const ingrediente = insumos.find(i => i.id === r.ingrediente_id) || r.ingrediente;
      if (!ingrediente) return null;
      return {
        ...r,
        ingrediente,
        costo_calculado: r.cantidad * ingrediente.costo_por_unidad,
      };
    })
    .filter((item): item is RecetaItem & { ingrediente: Ingrediente } => item !== null);
  const costoTotal = items.reduce((s, i) => s + i.costo_calculado, 0);
  const ganancia = precio - costoTotal;
  const margenPct = precio > 0 ? (ganancia / precio) * 100 : 0;
  return {
    receta: items as (RecetaItem & { ingrediente: Ingrediente })[],
    costoTotal,
    margenBruto: ganancia,
    margenPct,
    ganancia,
    precioMinimo: costoTotal * 1.3,
    precioIdeal: costoTotal * 2.5,
  };
}

export default function Costos() {
  const productos = useProductos();
  const insumos = useMemo(() => loadDemoIngredientes(), []);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [recetaItems, setRecetaItems] = useState<RecetaItem[]>([]);
  const [precioVenta, setPrecioVenta] = useState(0);
  const [addIngId, setAddIngId] = useState('');
  const [addCantidad, setAddCantidad] = useState('');
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [margenObjetivo, setMargenObjetivo] = useState(50);

  const calc = useMemo(
    () => calcularReceta(recetaItems, precioVenta, insumos),
    [recetaItems, precioVenta, insumos]
  );

  useEffect(() => {
    if (selectedProducto || productos.length === 0) return;
    const primero = productos[0];
    setSelectedProducto(primero);
    setRecetaItems(primero.receta || []);
    setPrecioVenta(primero.precio_venta);
  }, [productos, selectedProducto]);

  const selectProducto = (prod: Producto) => {
    setSelectedProducto(prod);
    setPrecioVenta(prod.precio_venta);
    setRecetaItems(prod.receta || []);
    setShowProductSelector(false);
  };

  const addIngrediente = () => {
    if (!addIngId || !addCantidad || !selectedProducto) return;
    const ing = insumos.find(i => i.id === addIngId);
    if (!ing) return;
    const newItem: RecetaItem = {
      id: `rec-${Date.now()}`,
      producto_id: selectedProducto.id,
      ingrediente_id: addIngId,
      cantidad: parseFloat(addCantidad),
      unidad_medida: ing.unidad_medida,
      costo_calculado: parseFloat(addCantidad) * ing.costo_por_unidad,
      created_at: new Date().toISOString(),
      ingrediente: ing,
    };
    setRecetaItems(prev => [...prev, newItem]);
    setAddIngId(''); setAddCantidad('');
  };

  const removeIngrediente = (id: string) => {
    setRecetaItems(prev => prev.filter(r => r.id !== id));
  };

  const precioParaMargen = (margen: number) => {
    if (margen >= 100) return 0;
    return calc.costoTotal / (1 - margen / 100);
  };

  const margenColor = (pct: number) => {
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 35) return 'text-amber-600';
    return 'text-red-600';
  };

  const margenBg = (pct: number) => {
    if (pct >= 50) return 'bg-emerald-50 border-emerald-200';
    if (pct >= 35) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  if (!selectedProducto) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Calculator size={36} className="mx-auto text-slate-300 mb-3" />
        <h3 className="font-semibold text-slate-800">Todavía no hay productos para analizar</h3>
        <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
          Cargá tu carta desde la pantalla Productos y tus insumos desde Stock. Con eso vas a poder
          calcular el costo de cada receta y el margen de ganancia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Seleccionar Producto</h3>
              <button
                onClick={() => setShowProductSelector(!showProductSelector)}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              >
                {selectedProducto.nombre}
                <ChevronDown size={14} />
              </button>
            </div>

            {showProductSelector && (
              <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                {productos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectProducto(p)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedProducto.id === p.id ? 'bg-amber-500 text-white' : 'bg-white hover:bg-amber-50 text-slate-700 border border-slate-100'
                    }`}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de venta actual $</label>
                <input
                  type="number"
                  value={precioVenta}
                  onChange={e => setPrecioVenta(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Margen objetivo %</label>
                <input
                  type="number"
                  value={margenObjetivo}
                  onChange={e => setMargenObjetivo(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  min="1" max="99"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Receta Técnica</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingrediente</th>
                    <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cantidad</th>
                    <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidad</th>
                    <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo unit.</th>
                    <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {calc.receta.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2.5">
                        <span className="font-medium text-slate-800">{item.ingrediente.nombre}</span>
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{item.cantidad}</td>
                      <td className="py-2.5 text-right text-slate-400 capitalize">{item.unidad_medida}</td>
                      <td className="py-2.5 text-right text-slate-500">${item.ingrediente.costo_por_unidad.toFixed(4)}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-800">${item.costo_calculado.toFixed(2)}</td>
                      <td className="py-2.5 pl-2">
                        <button
                          onClick={() => removeIngrediente(item.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={4} className="py-2.5 font-bold text-slate-700">Costo Total de Producción</td>
                    <td className="py-2.5 text-right font-bold text-lg text-slate-800">${calc.costoTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex gap-3 items-end p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Ingrediente</label>
                <select
                  value={addIngId}
                  onChange={e => setAddIngId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  <option value="">Seleccionar...</option>
                  {insumos.map(i => (
                    <option key={i.id} value={i.id}>{i.nombre} (${i.costo_por_unidad}/{i.unidad_medida})</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-slate-500 mb-1">Cantidad</label>
                <input
                  type="number"
                  value={addCantidad}
                  onChange={e => setAddCantidad(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-amber-400"
                  min="0" step="0.001" placeholder="0"
                />
              </div>
              <button
                onClick={addIngrediente}
                disabled={!addIngId || !addCantidad}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                Agregar
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`bg-white rounded-2xl border-2 p-5 ${margenBg(calc.margenPct)}`}>
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Calculator size={18} className="text-amber-600" />
              Análisis de Rentabilidad
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Precio de venta</span>
                <span className="font-bold text-slate-800">${precioVenta.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Costo de producción</span>
                <span className="font-semibold text-slate-700">-${calc.costoTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                <span className="text-sm font-medium text-slate-700">Ganancia por unidad</span>
                <span className={`font-bold text-lg ${calc.ganancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${calc.ganancia.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-medium text-slate-700">Margen bruto</span>
                <span className={`font-bold text-2xl ${margenColor(calc.margenPct)}`}>
                  {calc.margenPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-3 h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  calc.margenPct >= 50 ? 'bg-emerald-500' : calc.margenPct >= 35 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, calc.margenPct))}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0%</span>
              <span className="font-medium text-amber-600">Objetivo: {margenObjetivo}%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Precios Sugeridos
            </h3>
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-500">Precio mínimo (30% margen)</p>
                    <p className="text-lg font-bold text-slate-700">${calc.precioMinimo.toFixed(0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Ganancia</p>
                    <p className="text-sm font-semibold text-slate-600">${(calc.precioMinimo - calc.costoTotal).toFixed(0)}</p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-amber-600">Precio ideal (60% margen)</p>
                    <p className="text-lg font-bold text-amber-700">${calc.precioIdeal.toFixed(0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-amber-500">Ganancia</p>
                    <p className="text-sm font-bold text-amber-700">${(calc.precioIdeal - calc.costoTotal).toFixed(0)}</p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-blue-600">Para {margenObjetivo}% de margen</p>
                    <p className="text-lg font-bold text-blue-700">${precioParaMargen(margenObjetivo).toFixed(0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-blue-500">Ganancia</p>
                    <p className="text-sm font-bold text-blue-700">${(precioParaMargen(margenObjetivo) - calc.costoTotal).toFixed(0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" />
              Proyección de Ventas
            </h3>
            <div className="space-y-2">
              {[10, 25, 50, 100].map(cant => (
                <div key={cant} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-sm text-slate-500">{cant} unidades</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600">+${(calc.ganancia * cant).toFixed(0)}</span>
                    <span className="text-xs text-slate-400 ml-1">ganancia</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {calc.margenPct < 35 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">Margen muy bajo</p>
                <p className="text-xs text-red-600 mt-0.5">
                  El margen actual es de {calc.margenPct.toFixed(1)}%. Se recomienda un mínimo del 35% para cubrir costos operativos.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Comparativo de Rentabilidad — Todos los Productos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Producto</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Precio</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ganancia</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Margen</th>
                <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productos.map(prod => {
                const m = prod.precio_venta > 0 ? ((prod.precio_venta - prod.costo_produccion) / prod.precio_venta) * 100 : 0;
                const gan = prod.precio_venta - prod.costo_produccion;
                return (
                  <tr key={prod.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-800">{prod.nombre}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">${prod.precio_venta.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-500">${prod.costo_produccion.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">${gan.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-bold ${margenColor(m)}`}>{m.toFixed(1)}%</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-24">
                        <div
                          className={`h-full rounded-full ${m >= 50 ? 'bg-emerald-500' : m >= 35 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, m)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
