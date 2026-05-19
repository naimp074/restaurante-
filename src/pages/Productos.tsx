import { useState } from 'react';
import { Plus, CreditCard as Edit2, Eye, EyeOff, Search, X, Check, AlertTriangle } from 'lucide-react';
import type { Producto, CategoriaProducto } from '../lib/types';
import { mockProductos, mockCategorias } from '../lib/mockData';

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>(mockProductos);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Producto>>({});

  const filtered = productos.filter(p => {
    const matchCat = categoriaFiltro === 'todos' || p.categoria_id === categoriaFiltro;
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchSearch;
  });

  const toggleDisponible = (id: string) => {
    setProductos(prev => prev.map(p =>
      p.id === id ? { ...p, disponible: !p.disponible } : p
    ));
  };

  const toggleAgotado = (id: string) => {
    setProductos(prev => prev.map(p =>
      p.id === id ? { ...p, agotado: !p.agotado } : p
    ));
  };

  const openEdit = (producto: Producto) => {
    setEditForm(producto);
    setSelectedProducto(producto);
    setShowForm(true);
  };

  const openNew = () => {
    setEditForm({
      nombre: '', descripcion: '', precio_venta: 0, costo_produccion: 0,
      tiempo_preparacion: 10, disponible: true, agotado: false, activo: true,
    });
    setSelectedProducto(null);
    setShowForm(true);
  };

  const saveProducto = () => {
    if (!editForm.nombre) return;
    if (selectedProducto) {
      setProductos(prev => prev.map(p => p.id === selectedProducto.id ? { ...p, ...editForm } as Producto : p));
    } else {
      const newProd: Producto = {
        id: `prod-${Date.now()}`,
        nombre: editForm.nombre || '',
        descripcion: editForm.descripcion || '',
        categoria_id: editForm.categoria_id,
        precio_venta: editForm.precio_venta || 0,
        costo_produccion: editForm.costo_produccion || 0,
        margen_ganancia: editForm.precio_venta && editForm.costo_produccion
          ? ((editForm.precio_venta - editForm.costo_produccion) / editForm.precio_venta) * 100
          : 0,
        disponible: true, agotado: false, activo: true,
        tiempo_preparacion: editForm.tiempo_preparacion || 10,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        categoria: mockCategorias.find(c => c.id === editForm.categoria_id),
      };
      setProductos(prev => [newProd, ...prev]);
    }
    setShowForm(false);
  };

  const margen = (precio: number, costo: number) => precio > 0 ? ((precio - costo) / precio * 100).toFixed(1) : '0';
  const margenColor = (m: number) => m >= 50 ? 'text-emerald-600' : m >= 35 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex-1 max-w-sm">
            <Search size={14} className="text-slate-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            />
          </div>
          <div className="flex gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
            <button
              onClick={() => setCategoriaFiltro('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${categoriaFiltro === 'todos' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >Todos</button>
            {mockCategorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaFiltro(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${categoriaFiltro === cat.id ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >{cat.nombre}</button>
            ))}
          </div>
        </div>
        <button
          onClick={openNew}
          className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm transition-colors"
        >
          <Plus size={16} />
          Nuevo Producto
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Producto</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoría</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Precio Venta</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Margen</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(prod => {
                const m = parseFloat(margen(prod.precio_venta, prod.costo_produccion));
                return (
                  <tr key={prod.id} className={`hover:bg-slate-50 transition-colors ${!prod.disponible ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                          {prod.nombre[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{prod.nombre}</p>
                          <p className="text-xs text-slate-400 truncate max-w-48">{prod.descripcion}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: prod.categoria?.color + '20', color: prod.categoria?.color }}>
                        {prod.categoria?.nombre}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-800">${prod.precio_venta.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-slate-500 text-sm">${prod.costo_produccion.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold text-sm ${margenColor(m)}`}>{m}%</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {prod.agotado && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Agotado</span>
                        )}
                        {!prod.agotado && prod.disponible && (
                          <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">Activo</span>
                        )}
                        {!prod.disponible && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Inactivo</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => toggleAgotado(prod.id)}
                          className={`p-1.5 rounded-lg text-xs transition-colors ${prod.agotado ? 'bg-red-50 text-red-500' : 'hover:bg-slate-100 text-slate-400 hover:text-amber-600'}`}
                          title={prod.agotado ? 'Marcar disponible' : 'Marcar agotado'}
                        >
                          <AlertTriangle size={14} />
                        </button>
                        <button
                          onClick={() => toggleDisponible(prod.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          title={prod.disponible ? 'Deshabilitar' : 'Habilitar'}
                        >
                          {prod.disponible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={() => openEdit(prod)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg">
                {selectedProducto ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                  <input
                    value={editForm.nombre || ''}
                    onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                  <textarea
                    value={editForm.descripcion || ''}
                    onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                    rows={2}
                    placeholder="Descripción breve del producto"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                  <select
                    value={editForm.categoria_id || ''}
                    onChange={e => setEditForm(f => ({ ...f, categoria_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="">Sin categoría</option>
                    {mockCategorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tiempo prep. (min)</label>
                  <input
                    type="number"
                    value={editForm.tiempo_preparacion || ''}
                    onChange={e => setEditForm(f => ({ ...f, tiempo_preparacion: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de Venta $</label>
                  <input
                    type="number"
                    value={editForm.precio_venta || ''}
                    onChange={e => setEditForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 font-semibold"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Costo de Producción $</label>
                  <input
                    type="number"
                    value={editForm.costo_produccion || ''}
                    onChange={e => setEditForm(f => ({ ...f, costo_produccion: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
              </div>
              {editForm.precio_venta && editForm.costo_produccion && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Ganancia por unidad:</span>
                    <span className="font-bold text-amber-800">${(editForm.precio_venta - editForm.costo_produccion).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-amber-700">Margen:</span>
                    <span className="font-bold text-amber-800">{margen(editForm.precio_venta, editForm.costo_produccion)}%</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium">Cancelar</button>
              <button onClick={saveProducto} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2">
                <Check size={16} />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
