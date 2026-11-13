import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Send, X, Search, Clock, UtensilsCrossed, MessageSquarePlus, Banknote, Pencil, Ban, History, Hourglass, Undo2, ArrowLeftRight } from 'lucide-react';
import type { MetodoPago, Mesa, OpcionElegida, Pedido, PedidoItem, Producto, RepartoMixto, TipoEventoComanda } from '../lib/types';
import { DetalleItem, ElegirOpciones } from '../components/OpcionesProducto';
import { precioConOpciones, salenIgual, tieneOpciones } from '../lib/opcionesProducto';
import { useCategorias } from '../lib/categoriasStore';
import { loadDemoPedidos, saveDemoPedidos, usePedidos } from '../lib/demoStore';
import { useProductos } from '../lib/productosStore';
import { estadoOperativoMesa, loadMesas, mesaTienePedidoAbierto, ocuparMesa, sincronizarEstadoMesa, useMesas } from '../lib/mesasStore';
import { useMozas } from '../lib/usuariosStore';
import { useAuth } from '../contexts/AuthContext';
import { nuevoId } from '../lib/ids';
import { withStoreTransaction } from '../lib/storeSync';
import { esDeSalon } from '../lib/pedidosCanal';
import RelojItem from '../components/RelojItem';
import { tomarMesaAAbrir } from '../lib/mesaAAbrir';
import {
  anularItem, bloqueoEdicion, cambiarDeMesa, cancelarSolicitud, corregirItemPendiente, enviarACocina, estadoCobro,
  estadoCobroConfig, itemSinEnviar, itemsSinEnviar, nombreMedio, nuevaSolicitud, puedeAnularItems, type Actor,
} from '../lib/cobroComanda';
import SolicitarCobro from '../components/SolicitarCobro';
import PedirMotivo from '../components/PedirMotivo';

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
const textoEvento: Record<TipoEventoComanda, string> = {
  enviado_cocina: 'Envió a cocina',
  item_modificado: 'Corrigió',
  item_eliminado: 'Sacó',
  item_anulado: 'Anuló',
  cobro_solicitado: 'Pidió el cobro',
  cobro_cancelado: 'Canceló el pedido de cobro',
  ticket_emitido: 'Caja imprimió el ticket',
  ticket_anulado: 'Caja anuló el ticket',
  cobro_rechazado: 'Caja devolvió el cobro',
  pagada: 'Caja registró el pago',
  pago_anulado: 'Caja anuló el cobro',
  mesa_cambiada: 'Cambió de mesa',
};
const sinAcentos = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Mesas que coinciden con lo que se escribe. Un número busca por número ("1" trae 1, 10, 11…,
 * con la 1 primero); un texto busca en el nombre ("box", "vereda"). Sin búsqueda, todas.
 */
const filtrarMesas =(mesas: Mesa[], busqueda: string) => {
  const ordenadas = [...mesas].sort((a, b) => a.numero - b.numero);
  const q = sinAcentos(busqueda).replace(/^mesa\s*/, '');
  if (!q) return ordenadas;
  const coincide = (mesa: Mesa) => {
    const nombre = sinAcentos(mesa.nombre || '');
    if (/^\d+$/.test(q)) return String(mesa.numero).startsWith(q) || nombre.split(/\s+/).some(p => p.startsWith(q));
    return nombre.includes(q) || `mesa ${mesa.numero}`.includes(q);
  };
  const exacta = (mesa: Mesa) => String(mesa.numero) === q || sinAcentos(mesa.nombre || '') === q;
  return ordenadas.filter(coincide).sort((a, b) => Number(exacta(b)) - Number(exacta(a)));
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
  // Producto al que se le están eligiendo opciones; con item, se está corrigiendo uno ya cargado.
  const [eligiendo, setEligiendo] = useState<{ producto: Producto; item?: PedidoItem } | null>(null);
  const [verCobro, setVerCobro] = useState(false);
  const [cobroError, setCobroError] = useState('');
  const [enviandoCobro, setEnviandoCobro] = useState(false);
  const cobroEnProceso = useRef(false);
  const [anulando, setAnulando] = useState<PedidoItem | null>(null);
  const [anularError, setAnularError] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [cambiandoMesa, setCambiandoMesa] = useState(false);
  const [cambioMesaError, setCambioMesaError] = useState('');
  const [buscarDestino, setBuscarDestino] = useState('');
  const panelProductos = useRef<HTMLDivElement>(null);
  const actor: Actor = { id: user?.id, nombre: [user?.nombre, user?.apellido].filter(Boolean).join(' ') || 'Sin usuario', rol: user?.rol };

  const catalogoProductos = useProductos();
  const categorias = useCategorias();
  const mesasDisponibles = useMesas();
  const mozas = useMozas();
  const mesasLibres = mesasDisponibles.filter(m => estadoOperativoMesa(m, pedidos) === 'libre');
  const [buscarMesa, setBuscarMesa] = useState('');
  const mesasFiltradas = filtrarMesas(mesasDisponibles, buscarMesa);

  const filteredProductos = catalogoProductos.filter(p => {
    const matchCat = categoriaFiltro === 'todos' || p.categoria_id === categoriaFiltro;
    const matchBusq = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchBusq && p.disponible && !p.agotado;
  });
  const pendingItemsToKitchen = selectedPedido ? itemsSinEnviar(selectedPedido) : [];
  const esBorrador = Boolean(selectedPedido && selectedPedido.id === borradorId.current);
  // Con un cobro en caja no se toca el contenido: el importe tiene que seguir siendo el pedido.
  const bloqueo = selectedPedido && !esBorrador ? bloqueoEdicion(selectedPedido) : null;
  const tieneItems = Boolean(selectedPedido?.items?.some(i => i.estado !== 'cancelado'));

  useEffect(() => {
    setSelectedPedido(actual => {
      if (!actual) return null;
      if (actual.id === borradorId.current) {
        return pedidos.find(pedido => pedido.mesa_id === actual.mesa_id && pedidoAbierto(pedido)) || actual;
      }
      return pedidos.find(pedido => pedido.id === actual.id && pedidoAbierto(pedido)) || null;
    });
  }, [pedidos]);

  const elegirProducto = (producto: Producto) => {
    if (tieneOpciones(producto)) setEligiendo({ producto });
    else addItem(producto);
  };

  const addItem = (producto: Producto, opciones: OpcionElegida[] = [], observaciones = '') => {
    if (!selectedPedido) return;
    if (bloqueo) { setPedidoError(bloqueo); return; }
    // Solo se suma a lo que todavía no se mandó: lo que cocina ya tiene sale como renglón nuevo.
    const existing = selectedPedido.items?.find(i => itemSinEnviar(i, selectedPedido) && salenIgual(i, producto.id, opciones, observaciones));
    if (existing) {
      updateItemQty(existing, existing.cantidad + 1);
    } else {
      const precio = precioConOpciones(producto.precio_venta, opciones);
      const newItem: PedidoItem = {
        id: nuevoId('item'),
        pedido_id: selectedPedido.id,
        producto_id: producto.id,
        cantidad: 1,
        precio_unitario: precio,
        subtotal: precio,
        observaciones,
        opciones: opciones.length ? opciones : undefined,
        estado: 'pendiente',
        // En una comanda ya enviada, cocina no lo ve hasta que lo manden.
        sin_enviar: selectedPedido.estado !== 'abierto' ? true : undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        producto,
      };
      updatePedido({ ...selectedPedido, items: [...(selectedPedido.items || []), newItem] });
    }
  };

  const updateItemQty = (item: PedidoItem, qty: number) => {
    if (!selectedPedido) return;
    if (bloqueo) { setPedidoError(bloqueo); return; }
    if (!itemSinEnviar(item, selectedPedido)) {
      // Ya está en cocina sin empezar: sumar va como renglón nuevo; restar o sacar queda anotado.
      if (qty > item.cantidad) {
        const producto = catalogoProductos.find(p => p.id === item.producto_id) || item.producto;
        if (producto) addItem(producto, item.opciones, item.observaciones);
        return;
      }
      try {
        updatePedido(corregirItemPendiente(selectedPedido, item.id, { cantidad: qty }, actor));
      } catch (error) {
        setPedidoError(error instanceof Error ? error.message : 'No se pudo corregir el producto.');
      }
      return;
    }
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

  const corregirItem = (item: PedidoItem, producto: Producto, opciones: OpcionElegida[], observaciones: string) => {
    if (!selectedPedido) return;
    if (bloqueo) { setPedidoError(bloqueo); return; }
    const precio = precioConOpciones(producto.precio_venta, opciones);
    if (!itemSinEnviar(item, selectedPedido)) {
      try {
        updatePedido(corregirItemPendiente(selectedPedido, item.id, { opciones, observaciones, precio_unitario: precio }, actor));
      } catch (error) {
        setPedidoError(error instanceof Error ? error.message : 'No se pudo corregir el producto.');
      }
      return;
    }
    updatePedido({
      ...selectedPedido,
      items: (selectedPedido.items || []).map(i => (i.id === item.id ? {
        ...i,
        opciones: opciones.length ? opciones : undefined,
        observaciones,
        precio_unitario: precio,
        subtotal: precio * i.cantidad,
        updated_at: new Date().toISOString(),
      } : i)),
    });
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
    const bloqueoGuardado = !esNuevo && guardado ? bloqueoEdicion(guardado) : null;
    if (bloqueoGuardado) {
      // Otro dispositivo (o caja) cambió la comanda mientras se editaba acá.
      setSelectedPedido(guardado || null);
      setPedidoError(bloqueoGuardado);
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
    updatePedido(enviarACocina(selectedPedido, actor));
  };

  /** Cambios del cobro: se aplican sobre lo guardado, no sobre lo que muestra la pantalla. */
  const guardarCobro = (cambio: (pedido: Pedido) => Pedido): string => {
    if (!selectedPedido) return 'Elegí una mesa.';
    const actuales = loadDemoPedidos();
    const guardado = actuales.find(pedido => pedido.id === selectedPedido.id);
    if (!guardado || !pedidoAbierto(guardado)) return 'La comanda ya no está abierta.';
    try {
      const final = cambio(guardado);
      saveDemoPedidos(actuales.map(pedido => (pedido.id === final.id ? final : pedido)));
      setSelectedPedido(final);
      setPedidoError('');
      return '';
    } catch (error) {
      setSelectedPedido(guardado);
      return error instanceof Error ? error.message : 'No se pudo guardar.';
    }
  };

  const solicitarCobro = (metodo: MetodoPago, reparto?: RepartoMixto) => {
    // Un doble toque no manda dos pedidos de cobro (y nuevaSolicitud rechaza si ya hay uno).
    if (cobroEnProceso.current) return;
    cobroEnProceso.current = true;
    setEnviandoCobro(true);
    const error = guardarCobro(pedido => nuevaSolicitud(pedido, metodo, actor, undefined, reparto));
    cobroEnProceso.current = false;
    setEnviandoCobro(false);
    setCobroError(error);
    if (!error) setVerCobro(false);
  };

  /** Pasa la comanda entera a otra mesa libre; la de antes queda libre. Se aplica sobre lo guardado. */
  const moverAMesa = (destino: Mesa) => {
    if (!selectedPedido) return;
    const actuales = loadDemoPedidos();
    const guardado = actuales.find(pedido => pedido.id === selectedPedido.id);
    if (!guardado || !pedidoAbierto(guardado)) { setCambioMesaError('La comanda ya no está abierta.'); return; }
    try {
      const movido = cambiarDeMesa(guardado, destino, actuales, actor);
      withStoreTransaction(() => {
        saveDemoPedidos(actuales.map(pedido => (pedido.id === movido.id ? movido : pedido)));
        ocuparMesa(destino.id, movido.empleado_id);
        sincronizarEstadoMesa(guardado.mesa_id);
      });
      setSelectedPedido(movido);
      setCambiandoMesa(false);
      setCambioMesaError('');
      setBuscarDestino('');
      setPedidoError('');
    } catch (error) {
      setCambioMesaError(error instanceof Error ? error.message : 'No se pudo cambiar de mesa.');
    }
  };

  const retirarSolicitud = () => setPedidoError(guardarCobro(pedido => cancelarSolicitud(pedido, actor)));

  const abrirEdicion = () => {
    setShowAddProduct(true);
    setPedidoError('');
    window.setTimeout(() => panelProductos.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const confirmarAnulacion = (motivo: string) => {
    if (!selectedPedido || !anulando) return;
    try {
      updatePedido(anularItem(selectedPedido, anulando.id, motivo, actor));
      setAnulando(null);
      setAnularError('');
    } catch (error) {
      setAnularError(error instanceof Error ? error.message : 'No se pudo anular.');
    }
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

  const seleccionarMesa = (mesa: Mesa, apertura?: { personas?: number; mozaId?: string }) => {
    if (mesa.estado === 'cerrada') return;
    const abierto = loadDemoPedidos().find(pedido => pedido.mesa_id === mesa.id && pedidoAbierto(pedido));
    const seleccionado = abierto || prepararPedido(
      mesa,
      apertura?.personas ?? Math.min(2, Math.max(1, mesa.capacidad)),
      apertura?.mozaId || mesa.empleado_id || newMozaId,
    );
    borradorId.current = abierto ? null : seleccionado.id;
    setSelectedPedido(seleccionado);
    setShowAddProduct(true);
    setPedidoError('');
    setBusqueda('');
    setCategoriaFiltro('todos');
  };

  // Llegó desde el plano de Mesas: abre esa mesa como si la hubieran tocado acá.
  useEffect(() => {
    const pedida = tomarMesaAAbrir();
    if (!pedida) return;
    const mesa = loadMesas().find(item => item.id === pedida.mesaId);
    if (mesa) seleccionarMesa(mesa, pedida);
    // Solo al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400 focus-within:bg-white">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                type="search"
                inputMode="search"
                value={buscarMesa}
                onChange={e => setBuscarMesa(e.target.value)}
                onKeyDown={e => {
                  // Enter abre la mesa si la búsqueda deja una sola (o el número exacto).
                  if (e.key !== 'Enter') return;
                  const elegida = mesasFiltradas.find(m => String(m.numero) === buscarMesa.trim()) || (mesasFiltradas.length === 1 ? mesasFiltradas[0] : null);
                  if (elegida && elegida.estado !== 'cerrada') { seleccionarMesa(elegida); setBuscarMesa(''); }
                }}
                placeholder="Buscar mesa (número o nombre)"
                aria-label="Buscar mesa por número o nombre"
                className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder-slate-400"
              />
              {buscarMesa && (
                <button type="button" onClick={() => setBuscarMesa('')} aria-label="Borrar búsqueda" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 gap-2 p-3 max-h-[40vh] md:max-h-[calc(100vh-260px)] overflow-y-auto">
            {buscarMesa.trim() && mesasFiltradas.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-slate-500">No hay ninguna mesa «{buscarMesa.trim()}».</p>
            )}
            {mesasFiltradas.map(mesa => {
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
                      {pedido.solicitud_cobro && estadoCobro(pedido) !== 'pagada' ? estadoCobroConfig[estadoCobro(pedido)].label : pedido.estado === 'en_preparacion' ? 'En preparación' : pedido.estado === 'listo' ? 'Listo' : pedido.estado === 'entregado' ? 'Entregado' : 'Comanda abierta'} · {tiempoAbierto(pedido.hora_apertura)}
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
                  <div className="flex flex-wrap gap-2">
                    {!esBorrador && (
                      <button
                        type="button"
                        onClick={() => { setCambiandoMesa(true); setCambioMesaError(''); setBuscarDestino(''); }}
                        className="flex items-center gap-2 border border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                      >
                        <ArrowLeftRight size={14} />
                        Cambiar de mesa
                      </button>
                    )}
                    <button
                      onClick={() => setShowAddProduct(!showAddProduct)}
                      disabled={Boolean(bloqueo)}
                      title={bloqueo || undefined}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      <Plus size={14} />
                      Agregar producto
                    </button>
                  </div>
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
                {selectedPedido.solicitud_cobro && !esBorrador && (() => {
                  const solicitud = selectedPedido.solicitud_cobro;
                  if (!solicitud) return null;
                  const estado = estadoCobro(selectedPedido);
                  const hora = new Date(solicitud.solicitada_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div role="status" className={`mt-3 rounded-xl border p-3 text-sm ${estadoCobroConfig[estado].clase}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{estadoCobroConfig[estado].label}</p>
                        <p className="text-xs opacity-80">{nombreMedio(solicitud.metodo_pago)} · ${solicitud.total.toLocaleString('es-AR')} · {hora}</p>
                      </div>
                      {estado === 'solicitado' && <p className="mt-1 text-xs">Caja ya lo tiene. Hasta que lo resuelva, la comanda no se puede modificar.</p>}
                      {estado === 'ticket_emitido' && <p className="mt-1 text-xs">Caja imprimió el ticket{solicitud.ticket_por_nombre ? ` (${solicitud.ticket_por_nombre})` : ''}. Pasá a buscarlo y cobrale al cliente.</p>}
                      {estado === 'rechazada' && (
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs">
                            Caja la devolvió{solicitud.resuelta_por_nombre ? ` (${solicitud.resuelta_por_nombre})` : ''}: <strong>{solicitud.motivo_rechazo}</strong>. Corregí la comanda y volvé a pedir el cobro.
                          </p>
                          <button type="button" onClick={retirarSolicitud} className="text-xs font-semibold underline">Entendido</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{item.producto?.nombre}</p>
                          {itemSinEnviar(item, selectedPedido) && selectedPedido.estado !== 'abierto' ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">Sin enviar</span>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoItemColors[item.estado]}`}>
                              {item.estado === 'cancelado' && item.motivo_anulacion ? 'Anulado' : estadoItemLabels[item.estado]}
                            </span>
                          )}
                          <RelojItem item={item} />
                        </div>
                        <DetalleItem opciones={item.opciones} observaciones={item.observaciones} />
                        <p className="text-xs text-slate-500 mt-0.5">${item.precio_unitario.toLocaleString()} c/u</p>
                        {item.motivo_anulacion && (
                          <p className="text-xs text-red-600 mt-0.5">Anulado por {item.anulado_por || 'sin usuario'}: {item.motivo_anulacion}</p>
                        )}
                      </div>
                      {item.estado === 'pendiente' && !bloqueo ? (
                        <>
                          <button
                            onClick={() => {
                              const producto = catalogoProductos.find(p => p.id === item.producto_id) || item.producto;
                              if (producto) setEligiendo({ producto, item });
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50"
                            title="Elegir opciones o escribir una aclaración"
                          >
                            <MessageSquarePlus size={13} />
                            <span className="hidden sm:inline">Aclarar</span>
                          </button>
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
                            aria-label={`Sacar ${item.producto?.nombre || 'producto'}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-bold text-slate-800 w-8 text-center">x{item.cantidad}</span>
                          <p className="text-sm font-bold text-slate-800 w-20 text-right">${item.subtotal.toLocaleString()}</p>
                          {item.estado !== 'cancelado' && item.estado !== 'pendiente' && !bloqueo && puedeAnularItems(user?.rol) && (
                            <button
                              onClick={() => { setAnulando(item); setAnularError(''); }}
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              title="Anular (queda registrado)"
                              aria-label={`Anular ${item.producto?.nombre || 'producto'}`}
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))
                )}
                {!esBorrador && (selectedPedido.historial?.length ?? 0) > 0 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setVerHistorial(v => !v)}
                      aria-expanded={verHistorial}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      <History size={13} />{verHistorial ? 'Ocultar historial' : `Ver historial (${selectedPedido.historial?.length})`}
                    </button>
                    {verHistorial && (
                      <ol className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                        {[...(selectedPedido.historial || [])].reverse().map(evento => (
                          <li key={evento.id} className="text-xs text-slate-500">
                            <span className="font-mono text-slate-400">{new Date(evento.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {' · '}<span className="font-medium text-slate-700">{evento.usuario_nombre}</span>
                            {' · '}{textoEvento[evento.tipo]}{evento.detalle ? `: ${evento.detalle}` : ''}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
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
                  {selectedPedido.recargo > 0 && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>Recargo</span>
                      <span>${selectedPedido.recargo.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg text-slate-800 pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>${selectedPedido.total.toLocaleString()}</span>
                  </div>
                </div>
                {pendingItemsToKitchen.length > 0 || esBorrador || !tieneItems ? (
                  // Hay algo nuevo para mandar (o todavía no hay nada que cobrar): el botón de siempre.
                  <button
                    onClick={sendToKitchen}
                    disabled={pendingItemsToKitchen.length === 0}
                    className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <Send size={16} />
                    {pendingItemsToKitchen.length > 0 ? 'Enviar a Cocina' : 'Sin productos nuevos para enviar'}
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPedido.solicitud_cobro?.estado === 'solicitado' ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled
                          className="w-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-sm sm:text-base leading-tight text-center min-h-[3.25rem] px-2 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                        >
                          <Hourglass size={16} className="shrink-0" />
                          Cobro solicitado
                        </button>
                        <button type="button" onClick={retirarSolicitud} className="flex items-center justify-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600">
                          <Undo2 size={12} />Cancelar solicitud
                        </button>
                      </div>
                    ) : selectedPedido.solicitud_cobro?.estado === 'ticket_emitido' ? (
                      <button
                        type="button"
                        disabled
                        className="w-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold text-sm sm:text-base leading-tight text-center min-h-[3.25rem] px-2 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                      >
                        <Hourglass size={16} className="shrink-0" />
                        Ticket emitido · esperando pago
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCobroError(''); setVerCobro(true); }}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm sm:text-base leading-tight text-center min-h-[3.25rem] px-2 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm shadow-emerald-600/20"
                      >
                        <Banknote size={18} className="shrink-0" />
                        Cobrar comanda
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={abrirEdicion}
                      disabled={Boolean(bloqueo)}
                      title={bloqueo || undefined}
                      className="w-full self-start bg-white border border-slate-300 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50 disabled:hover:bg-white disabled:hover:border-slate-300 text-slate-700 font-semibold text-sm sm:text-base leading-tight text-center min-h-[3.25rem] px-2 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <Pencil size={16} className="shrink-0" />
                      Editar / Agregar productos
                    </button>
                  </div>
                )}
              </div>
            </div>

            {showAddProduct && !bloqueo && (
              <div ref={panelProductos} className="w-full xl:w-80 2xl:w-96 flex-shrink-0 bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[70vh] xl:max-h-none">
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
                    {[...categorias].sort((a, b) => a.orden - b.orden).map(cat => (
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
                      onClick={() => elegirProducto(prod)}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-amber-50 hover:border-amber-200 border border-slate-100 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 group-hover:text-amber-700">{prod.nombre}</p>
                        <p className="text-xs text-slate-400">{prod.categoria?.nombre}{tieneOpciones(prod) ? ' · con opciones' : ''}</p>
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

      {eligiendo && (
        <ElegirOpciones
          key={eligiendo.item?.id || eligiendo.producto.id}
          producto={eligiendo.producto}
          opcionesIniciales={eligiendo.item?.opciones}
          observacionesIniciales={eligiendo.item?.observaciones}
          cantidad={eligiendo.item?.cantidad}
          textoConfirmar={eligiendo.item ? 'Guardar cambios' : 'Agregar al pedido'}
          onCerrar={() => setEligiendo(null)}
          onConfirmar={(opciones, observaciones) => {
            if (eligiendo.item) corregirItem(eligiendo.item, eligiendo.producto, opciones, observaciones);
            else addItem(eligiendo.producto, opciones, observaciones);
            setEligiendo(null);
          }}
        />
      )}

      {cambiandoMesa && selectedPedido && (() => {
        const texto = buscarDestino.trim().toLowerCase().replace(/^mesa\s*/, '');
        const libres = [...mesasLibres]
          .filter(mesa => mesa.id !== selectedPedido.mesa_id && mesa.estado !== 'cerrada')
          .filter(mesa => !texto || String(mesa.numero).startsWith(texto) || (mesa.nombre || '').toLowerCase().includes(texto))
          .sort((a, b) => a.numero - b.numero);
        const origen = selectedPedido.mesa?.nombre || `Mesa ${selectedPedido.mesa?.numero}`;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setCambiandoMesa(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="titulo-cambiar-mesa" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h3 id="titulo-cambiar-mesa" className="flex items-center gap-2 text-lg font-bold text-slate-800">
                    <ArrowLeftRight size={18} className="text-amber-600" />Cambiar de mesa
                  </h3>
                  <p className="text-sm text-slate-500">
                    La comanda de <strong>{origen}</strong> pasa entera a la mesa que elijas, y {origen} queda libre.
                  </p>
                </div>
                <button type="button" onClick={() => setCambiandoMesa(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
                  <X size={16} />
                </button>
              </div>
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400 focus-within:bg-white">
                  <Search size={15} className="shrink-0 text-slate-400" />
                  <input
                    autoFocus
                    type="search"
                    value={buscarDestino}
                    onChange={e => setBuscarDestino(e.target.value)}
                    placeholder="Buscar mesa libre (número o nombre)"
                    aria-label="Buscar mesa libre"
                    className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder-slate-400"
                  />
                </div>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4">
                {libres.map(mesa => (
                  <button
                    key={mesa.id}
                    type="button"
                    onClick={() => moverAMesa(mesa)}
                    className="min-h-[56px] rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-sm font-semibold text-slate-800 hover:border-emerald-400"
                  >
                    {mesa.nombre || `Mesa ${mesa.numero}`}
                  </button>
                ))}
                {libres.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm text-slate-500">
                    {texto ? `No hay ninguna mesa libre «${buscarDestino.trim()}».` : 'No hay mesas libres.'}
                  </p>
                )}
              </div>
              {cambioMesaError && <p role="alert" className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{cambioMesaError}</p>}
            </div>
          </div>
        );
      })()}

      {verCobro && selectedPedido && (
        <SolicitarCobro
          pedido={selectedPedido}
          enviando={enviandoCobro}
          error={cobroError}
          onCerrar={() => setVerCobro(false)}
          onConfirmar={solicitarCobro}
        />
      )}

      {anulando && (
        <PedirMotivo
          titulo={`Anular ${anulando.cantidad}x ${anulando.producto?.nombre || 'producto'}`}
          descripcion="Cocina ya lo preparó o lo entregó. Queda tachado en la comanda, no se cobra y se registra quién lo anuló y por qué."
          placeholder="Ej: se cayó el plato, el cliente lo rechazó…"
          textoConfirmar="Anular producto"
          error={anularError}
          onCerrar={() => setAnulando(null)}
          onConfirmar={confirmarAnulacion}
        />
      )}

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
