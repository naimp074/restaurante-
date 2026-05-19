import { useState } from 'react';
import { Plus, Minus, Trash2, Send, X, Search, Check, Clock } from 'lucide-react';
import type { Pedido, PedidoItem, Producto, Mesa } from '../lib/types';
import { mockPedidos, mockMesas, mockProductos, mockCategorias, mockEmpleados } from '../lib/mockData';

const estadoItemColors: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  en_preparacion: 'bg-orange-100 text-orange-700',
  listo: 'bg-green-100 text-green-700',
  entregado: 'bg-slate-100 text-slate-500',
  cancelado: 'bg-red-100 text-red-600 line-through',
};
const estadoItemLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En prep.',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>(mockPedidos);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(mockPedidos[0]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newMesaId, setNewMesaId] = useState('');
  const [newPersonas, setNewPersonas] = useState(2);
  const [newMozaId, setNewMozaId] = useState('');

  const mesasDisponibles = mockMesas.filter(m => m.estado !== 'libre' && m.estado !== 'cerrada');
  const mozas = mockEmpleados.filter(e => e.rol === 'moza');

  const filteredProductos = mockProductos.filter(p => {
    const matchCat = categoriaFiltro === 'todos' || p.categoria_id === categoriaFiltro;
    const matchBusq = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchBusq && p.disponible && !p.agotado;
  });

  const addItem = (producto: Producto) => {
    if (!selectedPedido) return;
    const existing = selectedPedido.items?.find(i => i.producto_id === producto.id && i.estado !== 'cancelado');
    if (existing) {
      updateItemQty(existing, existing.cantidad + 1);
    } else {
      const newItem: PedidoItem = {
        id: `item-${Date.now()}`,
        pedido_id: selectedPedido.id,
        producto_id: producto.id,
        cantidad: 1,
        precio_unitario: producto.precio_venta,
        subtotal: producto.precio_venta,
        observaciones: '',
        estado: 'pendiente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        producto,
      };
      updatePedido({ ...selectedPedido, items: [...(selectedPedido.items || []), newItem] });
    }
  };

  const updateItemQty = (item: PedidoItem, qty: number) => {
    if (!selectedPedido) return;
    let items = selectedPedido.items || [];
    if (qty <= 0) {
      items = items.filter(i => i.id !== item.id);
    } else {
      items = items.map(i =>
        i.id === item.id
          ? { ...i, cantidad: qty, subtotal: qty * i.precio_unitario }
          : i
      );
    }
    updatePedido({ ...selectedPedido, items });
  };

  const updatePedido = (updated: Pedido) => {
    const subtotal = (updated.items || []).filter(i => i.estado !== 'cancelado').reduce((s, i) => s + i.subtotal, 0);
    const final = { ...updated, subtotal, total: subtotal - updated.descuento + updated.recargo };
    setSelectedPedido(final);
    setPedidos(prev => prev.map(p => p.id === final.id ? final : p));
  };

  const sendToKitchen = () => {
    if (!selectedPedido) return;
    const updated = { ...selectedPedido, estado: 'en_preparacion' as const };
    updatePedido(updated);
  };

  const createOrder = () => {
    const mesa = mockMesas.find(m => m.id === newMesaId);
    const moza = mockEmpleados.find(e => e.id === newMozaId);
    if (!mesa) return;
    const newPedido: Pedido = {
      id: `ped-${Date.now()}`,
      mesa_id: newMesaId,
      empleado_id: newMozaId,
      cantidad_personas: newPersonas,
      estado: 'abierto',
      subtotal: 0, descuento: 0, recargo: 0, total: 0,
      observaciones: '',
      hora_apertura: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mesa, empleado: moza, items: [],
    };
    setPedidos(prev => [...prev, newPedido]);
    setSelectedPedido(newPedido);
    setShowNewOrder(false);
  };

  const tiempoAbierto = (hora: string) => {
    const diff = Math.floor((Date.now() - new Date(hora).getTime()) / 60000);
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  return (
    <div className="flex gap-6 h-full">
      <div className="w-64 flex-shrink-0 space-y-3">
        <button
          onClick={() => setShowNewOrder(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Plus size={16} />
          Nuevo Pedido
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pedidos Activos</p>
          </div>
          <div className="divide-y divide-slate-50 max-h-[calc(100vh-240px)] overflow-y-auto">
            {pedidos.filter(p => p.estado !== 'cobrado' && p.estado !== 'cancelado').map(pedido => (
              <button
                key={pedido.id}
                onClick={() => setSelectedPedido(pedido)}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-colors ${selectedPedido?.id === pedido.id ? 'bg-amber-50 border-l-2 border-amber-500' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-slate-800 text-sm">Mesa {pedido.mesa?.numero}</span>
                  <span className="text-xs text-slate-400">{tiempoAbierto(pedido.hora_apertura)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{pedido.empleado?.nombre}</div>
                <div className="flex justify-between items-center mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    pedido.estado === 'en_preparacion' ? 'bg-orange-100 text-orange-700' :
                    pedido.estado === 'listo' ? 'bg-green-100 text-green-700' :
                    pedido.estado === 'entregado' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {pedido.estado === 'en_preparacion' ? 'En prep.' :
                     pedido.estado === 'listo' ? 'Listo' :
                     pedido.estado === 'entregado' ? 'Entregado' : 'Abierto'}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">${pedido.total.toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-w-0">
        {selectedPedido ? (
          <>
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col">
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">Mesa {selectedPedido.mesa?.numero}</h3>
                    <p className="text-sm text-slate-500">
                      {selectedPedido.empleado?.nombre} · {selectedPedido.cantidad_personas} personas · {tiempoAbierto(selectedPedido.hora_apertura)}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddProduct(!showAddProduct)}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    <Plus size={14} />
                    Agregar producto
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {!selectedPedido.items?.length ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                    <Plus size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">No hay productos en este pedido</p>
                    <button onClick={() => setShowAddProduct(true)} className="mt-2 text-amber-500 text-sm font-medium hover:underline">
                      Agregar productos
                    </button>
                  </div>
                ) : (
                  selectedPedido.items?.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${item.estado === 'cancelado' ? 'opacity-40 bg-slate-50' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{item.producto?.nombre}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoItemColors[item.estado]}`}>
                            {estadoItemLabels[item.estado]}
                          </span>
                        </div>
                        {item.observaciones && (
                          <p className="text-xs text-amber-600 mt-0.5">* {item.observaciones}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">${item.precio_unitario.toLocaleString()} c/u</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateItemQty(item, item.cantidad - 1)}
                          className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 text-slate-600"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-sm font-bold text-slate-800 w-5 text-center">{item.cantidad}</span>
                        <button
                          onClick={() => updateItemQty(item, item.cantidad + 1)}
                          className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 text-slate-600"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-slate-800 w-20 text-right">${item.subtotal.toLocaleString()}</p>
                      <button
                        onClick={() => updateItemQty(item, 0)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span>${selectedPedido.subtotal.toLocaleString()}</span>
                  </div>
                  {selectedPedido.descuento > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Descuento</span>
                      <span>-${selectedPedido.descuento.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg text-slate-800 pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>${selectedPedido.total.toLocaleString()}</span>
                  </div>
                </div>
                <button
                  onClick={sendToKitchen}
                  disabled={!selectedPedido.items?.some(i => i.estado === 'pendiente')}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={16} />
                  Enviar a Cocina
                </button>
              </div>
            </div>

            {showAddProduct && (
              <div className="w-96 flex-shrink-0 bg-white rounded-2xl border border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-800">Agregar Productos</h4>
                  <button onClick={() => setShowAddProduct(false)}>
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>
                <div className="p-3 border-b border-slate-100 space-y-2">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      placeholder="Buscar producto..."
                      className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
                    />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setCategoriaFiltro('todos')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${categoriaFiltro === 'todos' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >Todos</button>
                    {mockCategorias.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoriaFiltro(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${categoriaFiltro === cat.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >{cat.nombre}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredProductos.map(prod => (
                    <button
                      key={prod.id}
                      onClick={() => addItem(prod)}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-amber-50 hover:border-amber-200 border border-slate-100 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 group-hover:text-amber-700">{prod.nombre}</p>
                        <p className="text-xs text-slate-400">{prod.categoria?.nombre}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">${prod.precio_venta.toLocaleString()}</span>
                        <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus size={12} className="text-white" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p>Seleccioná un pedido para gestionarlo</p>
            </div>
          </div>
        )}
      </div>

      {showNewOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Nuevo Pedido</h3>
              <button onClick={() => setShowNewOrder(false)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mesa</label>
                <select
                  value={newMesaId}
                  onChange={e => setNewMesaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar mesa...</option>
                  {mockMesas.filter(m => m.estado === 'libre').map(m => (
                    <option key={m.id} value={m.id}>Mesa {m.numero} - {m.sector}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Moza</label>
                <select
                  value={newMozaId}
                  onChange={e => setNewMozaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar...</option>
                  {mockEmpleados.filter(e => e.rol === 'moza').map(m => (
                    <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Personas</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setNewPersonas(p => Math.max(1, p - 1))} className="w-9 h-9 border border-slate-200 rounded-xl flex items-center justify-center">-</button>
                  <span className="text-xl font-bold w-8 text-center">{newPersonas}</span>
                  <button onClick={() => setNewPersonas(p => p + 1)} className="w-9 h-9 border border-slate-200 rounded-xl flex items-center justify-center">+</button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowNewOrder(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium">Cancelar</button>
              <button onClick={createOrder} disabled={!newMesaId} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-amber-400 transition-colors">Crear Pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
