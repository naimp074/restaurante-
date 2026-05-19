import { useState } from 'react';
import { Plus, AlertTriangle, TrendingDown, Package, CreditCard as Edit2, X, Check } from 'lucide-react';
import type { Ingrediente, UnidadMedida } from '../lib/types';
import { mockIngredientes, mockProveedores } from '../lib/mockData';

const unidades: UnidadMedida[] = ['gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete'];

export default function Stock() {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(mockIngredientes);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Ingrediente> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCompra, setShowCompra] = useState(false);
  const [compraIngId, setCompraIngId] = useState('');
  const [compraCantidad, setCompraCantidad] = useState('');
  const [compraCosto, setCompraCosto] = useState('');

  const stockBajo = ingredientes.filter(i => i.stock_actual <= i.stock_minimo);
  const stockMedio = ingredientes.filter(i => i.stock_actual > i.stock_minimo && i.stock_actual <= i.stock_minimo * 1.5);
  const stockOk = ingredientes.filter(i => i.stock_actual > i.stock_minimo * 1.5);

  const getStockStatus = (ing: Ingrediente) => {
    if (ing.stock_actual <= ing.stock_minimo) return { color: 'bg-red-100 text-red-700', label: 'Crítico', dot: 'bg-red-500' };
    if (ing.stock_actual <= ing.stock_minimo * 1.5) return { color: 'bg-amber-100 text-amber-700', label: 'Bajo', dot: 'bg-amber-500' };
    return { color: 'bg-emerald-100 text-emerald-700', label: 'Normal', dot: 'bg-emerald-500' };
  };

  const openEdit = (ing: Ingrediente) => {
    setEditItem({ ...ing });
    setEditId(ing.id);
    setShowForm(true);
  };

  const openNew = () => {
    setEditItem({ nombre: '', unidad_medida: 'unidad', stock_actual: 0, stock_minimo: 0, costo_por_unidad: 0, activo: true });
    setEditId(null);
    setShowForm(true);
  };

  const saveItem = () => {
    if (!editItem?.nombre) return;
    if (editId) {
      setIngredientes(prev => prev.map(i => i.id === editId ? { ...i, ...editItem } as Ingrediente : i));
    } else {
      const newIng: Ingrediente = {
        id: `ing-${Date.now()}`,
        nombre: editItem.nombre || '',
        unidad_medida: editItem.unidad_medida || 'unidad',
        stock_actual: editItem.stock_actual || 0,
        stock_minimo: editItem.stock_minimo || 0,
        costo_por_unidad: editItem.costo_por_unidad || 0,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setIngredientes(prev => [...prev, newIng]);
    }
    setShowForm(false);
  };

  const registrarCompra = () => {
    const cant = parseFloat(compraCantidad);
    const costo = parseFloat(compraCosto);
    if (!compraIngId || !cant) return;
    setIngredientes(prev => prev.map(i =>
      i.id === compraIngId
        ? { ...i, stock_actual: i.stock_actual + cant, costo_por_unidad: costo > 0 ? costo : i.costo_por_unidad }
        : i
    ));
    setShowCompra(false);
    setCompraIngId(''); setCompraCantidad(''); setCompraCosto('');
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={20} />
          <div>
            <p className="text-xl font-bold text-red-700">{stockBajo.length}</p>
            <p className="text-xs text-red-600">Stock crítico</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <TrendingDown className="text-amber-500" size={20} />
          <div>
            <p className="text-xl font-bold text-amber-700">{stockMedio.length}</p>
            <p className="text-xs text-amber-600">Stock bajo</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <Package className="text-emerald-500" size={20} />
          <div>
            <p className="text-xl font-bold text-emerald-700">{stockOk.length}</p>
            <p className="text-xs text-emerald-600">Stock normal</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Insumos y Materias Primas</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompra(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} />
            Registrar Compra
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} />
            Nuevo Insumo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Insumo</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidad</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Actual</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Mín.</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo/Unidad</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barra</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ingredientes.map(ing => {
                const status = getStockStatus(ing);
                const pct = Math.min(100, Math.round((ing.stock_actual / (ing.stock_minimo * 3)) * 100));
                return (
                  <tr key={ing.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
                        <span className="font-medium text-slate-800 text-sm">{ing.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-500 capitalize">{ing.unidad_medida}</td>
                    <td className="py-3 px-4 text-right font-semibold text-sm">
                      <span className={ing.stock_actual <= ing.stock_minimo ? 'text-red-600' : 'text-slate-800'}>
                        {ing.stock_actual.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-slate-500">{ing.stock_minimo.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-600">${ing.costo_por_unidad.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct < 34 ? 'bg-red-500' : pct < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openEdit(ing)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editId ? 'Editar Insumo' : 'Nuevo Insumo'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <input
                  value={editItem.nombre || ''}
                  onChange={e => setEditItem(i => ({ ...i, nombre: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="Nombre del insumo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidad de medida</label>
                  <select
                    value={editItem.unidad_medida || 'unidad'}
                    onChange={e => setEditItem(i => ({ ...i, unidad_medida: e.target.value as UnidadMedida }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Costo por unidad $</label>
                  <input
                    type="number"
                    value={editItem.costo_por_unidad || ''}
                    onChange={e => setEditItem(i => ({ ...i, costo_por_unidad: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0" step="0.001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock actual</label>
                  <input
                    type="number"
                    value={editItem.stock_actual || ''}
                    onChange={e => setEditItem(i => ({ ...i, stock_actual: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock mínimo</label>
                  <input
                    type="number"
                    value={editItem.stock_minimo || ''}
                    onChange={e => setEditItem(i => ({ ...i, stock_minimo: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={saveItem} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2">
                <Check size={16} />Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompra && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Registrar Entrada de Stock</h3>
              <button onClick={() => setShowCompra(false)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Insumo</label>
                <select
                  value={compraIngId}
                  onChange={e => setCompraIngId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  <option value="">Seleccionar...</option>
                  {ingredientes.map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad recibida</label>
                <input
                  type="number"
                  value={compraCantidad}
                  onChange={e => setCompraCantidad(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  min="0" placeholder="Ej: 5000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nuevo costo por unidad $ (opcional)</label>
                <input
                  type="number"
                  value={compraCosto}
                  onChange={e => setCompraCosto(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  min="0" step="0.001" placeholder="Dejar en 0 para mantener el actual"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowCompra(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={registrarCompra} disabled={!compraIngId || !compraCantidad} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-400 flex items-center justify-center gap-2">
                <Plus size={14} />Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
