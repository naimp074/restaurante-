import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Send, X, Search, Clock, UtensilsCrossed } from 'lucide-react';
import type { Mesa, Pedido, PedidoItem, Producto } from '../lib/types';
import { categoriasIniciales } from '../lib/mockData';
import { loadDemoPedidos, saveDemoPedidos, usePedidos } from '../lib/demoStore';
import { useProductos } from '../lib/productosStore';
import { estadoOperativoMesa, loadMesas, mesaTienePedidoAbierto, ocuparMesa, useMesas } from '../lib/mesasStore';
import { useMozas } from '../lib/usuariosStore';
import { useAuth } from '../contexts/AuthContext';
import { nuevoId } from '../lib/ids';
import { esDeSalon } from '../lib/pedidosCanal';

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
// Esta pantalla es del salón: los pedidos para llevar, delivery y PedidosYa tienen su apartado.
const pedidoAbierto = (pedido: Pedido) => esDeSalon(pedido) && !['cobrado', 'cuenta_corriente', 'cancelado'].includes(pedido.estado);

export default function Pedidos() {
  const { user } = useAuth();
  const pedidos = usePedidos();
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(() => loadDemoPedidos().find(pedidoAbierto) || null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newMesaId, setNewMesaId] = useState('');
  const [newPersonas, setNewPersonas] = useState(2);
  const [newMozaId, setNewMozaId] = useState(() => (user && (user.rol === 'moza' || user.rol === 'encargado') ? user.id : ''));
  const borradorId = useRef<string | null>(null);
  const [pedidoError, setPedidoError] = useState('');

  const catalogoProductos = useProductos();
  const mesasDisponibles = useMesas();
  const mozas = useMozas();
  const mesasLibres = mesasDisponibles.filter(m => estadoOperativoMesa(m, pedidos) === 'libre');

  const filteredProductos = catalogoProductos.filter(p => {
    const matchCat = categoriaFiltro === 'todos' || p.categoria_id === categoriaFiltro;
    const matchBusq = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchBusq && p.disponible && !p.agotado;
  });
  const pendingItemsToKitchen = selectedPedido?.items?.filter(i => i.estado === 'pendiente') || [];

  useEffect(() => {
    setSelectedPedido(actual => {
      if (!actual) return null;
      if (actual.id === borradorId.current) {
        return pedidos.find(pedido => pedido.mesa_id === actual.mesa_id && pedidoAbierto(pedido)) || actual;
      }
      return pedidos.find(pedido => pedido.id === actual.id && pedidoAbierto(pedido)) || null;
    });
  }, [pedidos]);

  const addItem = (producto: Producto) => {
    if (!selectedPedido) return;
    const existing = selectedPedido.items?.find(i => i.producto_id === producto.id && i.estado === 'pendiente');
    if (existing) {
      updateItemQty(existing, existing.cantidad + 1);
    } else {
      const newItem: PedidoItem = {
        id: nuevoId('item'),
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
    const actuales = loadDemoPedidos();
    const esNuevo = updated.id === borradorId.current;
    const guardado = actuales.find(pedido => pedido.id === updated.id);
    const mesa = loadMesas().find(item => item.id === updated.mesa_id);
    if (!mesa || mesa.estado === 'cerrada' || (!esNuevo && (!guardado || !pedidoAbierto(guardado)))) {
      setPedidoError('La mesa o la comanda ya no está disponible. Seleccioná otra mesa.');
      return;
    }
    const otroPedido = esNuevo && actuales.find(pedido => pedido.mesa_id === updated.mesa_id && pedidoAbierto(pedido));
    if (otroPedido) {
      borradorId.current = null;
      setSelectedPedido(otroPedido);
      setPedidoError('Esta mesa ya tiene una comanda abierta. Agregá el producto a esa comanda.');
      return;
    }
    const subtotal = (updated.items || []).filter(i => i.estado !== 'cancelado').reduce((s, i) => s + i.subtotal, 0);
    const final = { ...updated, subtotal, total: subtotal - updated.descuento + updated.recargo, updated_at: new Date().toISOString() };
    borradorId.current = null;
    saveDemoPedidos(esNuevo ? [...actuales, final] : actuales.map(p => p.id === final.id ? final : p));
    if (esNuevo) ocuparMesa(final.mesa_id, final.empleado_id);
    setSelectedPedido(final);
    setPedidoError('');
  };

  const sendToKitchen = () => {
    if (!selectedPedido) return;
    const updated = {
      ...selectedPedido,
      estado: 'en_preparacion' as const,
      updated_at: new Date().toISOString(),
    };
    updatePedido(updated);
  };

  const prepararPedido = (mesa: Mesa, personas: number, mozaId: string): Pedido => ({
      id: nuevoId('ped'),
      mesa_id: mesa.id,
      empleado_id: mozaId || undefined,
      cantidad_personas: personas,
      estado: 'abierto',
      subtotal: 0, descuento: 0, recargo: 0, total: 0,
      observaciones: '',
      hora_apertura: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mesa, empleado: mozas.find(e => e.id === mozaId), items: [],
  });

  const seleccionarMesa = (mesa: Mesa) => {
    if (mesa.estado === 'cerrada') return;
    const abierto = loadDemoPedidos().find(pedido => pedido.mesa_id === mesa.id && pedidoAbierto(pedido));
    const seleccionado = abierto || prepararPedido(mesa, Math.min(2, Math.max(1, mesa.capacidad)), mesa.empleado_id || newMozaId);
    borradorId.current = abierto ? null : seleccionado.id;
    setSelectedPedido(seleccionado);
    setShowAddProduct(true);
    setPedidoError('');
    setBusqueda('');
    setCategoriaFiltro('todos');
  };

  const createOrder = () => {
    const mesa = loadMesas().find(m => m.id === newMesaId);
    const actuales = loadDemoPedidos();
    if (!mesa || estadoOperativoMesa(mesa, actuales) !== 'libre' || mesaTienePedidoAbierto(newMesaId, actuales)) return;
    const newPedido = prepararPedido(mesa, newPersonas, newMozaId);
    borradorId.current = null;
    saveDemoPedidos([...actuales, newPedido]);
    ocuparMesa(newMesaId, newMozaId);
    setSelectedPedido(newPedido);
    setShowNewOrder(false);
    setShowAddProduct(true);
    setPedidoError('');
  };

  const tiempoAbierto = (hora: string) => {
    const diff = Math.floor((Date.now() - new Date(hora).getTime()) / 60000);
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 xl:gap-6 h-full">
      <div className="w-full md:w-56 xl:w-64 flex-shrink-0 space-y-3">
        <button
          onClick={() => setShowNewOrder(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Plus size={16} />
          Nueva Comanda
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Mesas</h3>
              <span className="text-xs font-medium text-emerald-700">{mesasLibres.length} libres</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Seleccioná una mesa y agregá su pedido.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 gap-2 p-3 max-h-[40vh] md:max-h-[calc(100vh-260px)] overflow-y-auto">
            {[...mesasDisponibles].sort((a, b) => a.numero - b.numero).map(mesa => {
              const pedido = pedidos.find(item => item.mesa_id === mesa.id && pedidoAbierto(item));
              const cerrada = mesa.estado === 'cerrada';
              const seleccionada = selectedPedido?.mesa_id === mesa.id;
              return (
                <button
                  key={mesa.id}
                  type="button"
                  onClick={() => seleccionarMesa(mesa)}
                  disabled={cerrada}
                  aria-pressed={seleccionada}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    seleccionada ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400' :
                    cerrada ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed' :
                    pedido ? 'border-blue-200 bg-blue-50 hover:border-blue-400' :
                    'border-emerald-200 bg-emerald-50 hover:border-emerald-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed size={16} className={pedido ? 'text-blue-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                    <span className="font-semibold text-slate-800 text-sm truncate">{mesa.nombre || `Mesa ${mesa.numero}`}</span>
                  </div>
                  {mesa.nombre && <p className="text-[11px] text-slate-500 mt-1">Mesa {mesa.numero}</p>}
                  <div className="flex flex-wrap justify-between items-center gap-1 mt-2">
                    <span className={`text-xs font-medium ${cerrada ? 'text-slate-500' : pedido ? 'text-blue-700' : 'text-emerald-700'}`}>
                      {cerrada ? 'Fuera de servicio' : pedido ? 'Ocupada' : 'Libre'}
                    </span>
                    {pedido && <span className="text-xs font-bold text-slate-700">${pedido.total.toLocaleString('es-AR')}</span>}
                  </div>
                  {pedido ? (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {pedido.estado === 'en_preparacion' ? 'En preparación' : pedido.estado === 'listo' ? 'Listo' : pedido.estado === 'entregado' ? 'Entregado' : 'Comanda abierta'} · {tiempoAbierto(pedido.hora_apertura)}
                    </p>
                  ) : !cerrada && <p className="text-[11px] text-emerald-700 mt-1">Tocá para agregar pedido</p>}
                </button>
              );
            })}
            {mesasDisponibles.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-slate-500">Todavía no hay mesas. Cargalas desde la pantalla Mesas.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 xl:gap-6 min-w-0">
        {selectedPedido ? (
          <>
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800">{selectedPedido.mesa?.nombre || `Mesa ${selectedPedido.mesa?.numero}`}</h3>
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
                {selectedPedido.id === borradorId.current && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="text-xs text-slate-500">Personas
                      <input type="number" min="1" value={selectedPedido.cantidad_personas}
                        onChange={e => setSelectedPedido({ ...selectedPedido, cantidad_personas: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="ml-2 w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800" />
                    </label>
                    <label className="text-xs text-slate-500">Moza
                      <select value={selectedPedido.empleado_id || ''}
                        onChange={e => setSelectedPedido({ ...selectedPedido, empleado_id: e.target.value || undefined, empleado: mozas.find(moza => moza.id === e.target.value) })}
                        className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800">
                        <option value="">Sin asignar</option>
                        {mozas.map(moza => <option key={moza.id} value={moza.id}>{moza.nombre}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                {pedidoError && <p role="alert" className="mt-3 text-sm text-red-600">{pedidoError}</p>}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {!selectedPedido.items?.length ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                    <Plus size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">No hay productos en esta comanda</p>
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
                      {item.estado === 'pendiente' ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-bold text-slate-800 w-8 text-center">x{item.cantidad}</span>
                          <p className="text-sm font-bold text-slate-800 w-20 text-right">${item.subtotal.toLocaleString()}</p>
                        </>
                      )}
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
                  disabled={pendingItemsToKitchen.length === 0}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={16} />
                  {pendingItemsToKitchen.length > 0 ? 'Enviar a Cocina' : 'Sin productos nuevos para enviar'}
                </button>
              </div>
            </div>

            {showAddProduct && (
              <div className="w-full xl:w-80 2xl:w-96 flex-shrink-0 bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[70vh] xl:max-h-none">
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
                    {categoriasIniciales.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoriaFiltro(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${categoriaFiltro === cat.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >{cat.nombre}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredProductos.length === 0 && (
                    <div className="text-center py-10 px-4">
                      <p className="text-sm font-medium text-slate-600">
                        {catalogoProductos.length === 0 ? 'Todavía no hay productos cargados' : 'Sin resultados'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {catalogoProductos.length === 0
                          ? 'Cargá tu carta desde la pantalla Productos, a mano o importando el Excel.'
                          : 'Probá con otro nombre o categoría.'}
                      </p>
                    </div>
                  )}
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
              <p>Seleccioná una mesa para agregar su pedido</p>
            </div>
          </div>
        )}
      </div>

      {showNewOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Nueva Comanda</h3>
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
                  {mesasLibres.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre || `Mesa ${m.numero}`} - {m.sector}</option>
                  ))}
                </select>
                {mesasDisponibles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Primero cargá las mesas de tu local desde la pantalla Mesas.
                  </p>
                )}
                {mesasDisponibles.length > 0 && mesasLibres.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Todas las mesas tienen comanda abierta o están fuera de servicio.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Moza</label>
                <select
                  value={newMozaId}
                  onChange={e => setNewMozaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar...</option>
                  {mozas.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                  ))}
                </select>
                {mozas.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Cargá tu personal desde la pantalla Usuarios para poder asignarlo.
                  </p>
                )}
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
              <button onClick={createOrder} disabled={!newMesaId} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-amber-400 transition-colors">Crear Comanda</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
