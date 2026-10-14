import { useEffect, useMemo, useState } from 'react';
import { Bike, Check, Clock, Minus, Phone, Plus, Search, ShoppingBag, Store, Trash2, X, XCircle, AlertTriangle, MapPin } from 'lucide-react';
import type { CanalPedido, Pedido, Producto } from '../lib/types';
import { usePedidos } from '../lib/demoStore';
import { useProductos } from '../lib/productosStore';
import { useAuth } from '../contexts/AuthContext';
import { dayKey } from '../lib/fechas';
import { canalDe, etiquetaPedido, nombresCanal } from '../lib/pedidosCanal';
import {
  avisarAPedidosYa,
  cancelarPedido,
  cargarConfigPedidosYa,
  crearPedidoLocal,
  finalizarPedidoPlataforma,
  marcarEntregado,
  netoPedidosYa,
  pedidoAbierto,
  type AccionPedidosYa,
  type LineaNueva,
} from '../lib/pedidosExternos';

type Filtro = 'todos' | Exclude<CanalPedido, 'salon'>;

const estiloCanal: Record<Exclude<CanalPedido, 'salon'>, { chip: string; borde: string; icono: typeof Store }> = {
  mostrador: { chip: 'bg-violet-100 text-violet-700', borde: 'border-violet-200', icono: Store },
  delivery: { chip: 'bg-sky-100 text-sky-700', borde: 'border-sky-200', icono: Bike },
  pedidosya: { chip: 'bg-rose-100 text-rose-700', borde: 'border-rose-200', icono: ShoppingBag },
};

const estadoCocina: Record<string, string> = {
  abierto: 'Esperando confirmación',
  en_preparacion: 'En cocina',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cobrado: 'Cerrado',
  cancelado: 'Cancelado',
};

const motivos: { id: string; label: string }[] = [
  { id: 'TOO_BUSY', label: 'Mucho trabajo en cocina' },
  { id: 'ITEM_UNAVAILABLE', label: 'Falta un producto' },
  { id: 'CLOSED', label: 'El local está cerrado' },
  { id: 'OUTSIDE_DELIVERY_AREA', label: 'Fuera de la zona de entrega' },
  { id: 'NO_COURIER', label: 'No hay repartidor' },
  { id: 'ADDRESS_INCOMPLETE_MISSTATED', label: 'Dirección incompleta' },
  { id: 'TEST_ORDER', label: 'Pedido de prueba' },
];

const dinero = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

const minutosDesde = (fecha: string, ahora: number) => Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60000));

export default function PedidosDelivery() {
  const { user, modoDemo } = useAuth();
  const pedidos = usePedidos();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [verCerrados, setVerCerrados] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  // null: todavía no se leyó la comisión del servidor (en demo no hay servidor: 0).
  const [comisionServidor, setComisionServidor] = useState<number | null>(null);
  const comision = modoDemo ? 0 : comisionServidor;
  const [pyaConfigurado, setPyaConfigurado] = useState<boolean | null>(null);

  const operaPlataforma = user?.rol === 'admin' || user?.rol === 'encargado' || user?.rol === 'cajero';

  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (modoDemo || !operaPlataforma) return;
    cargarConfigPedidosYa()
      .then(config => {
        setPyaConfigurado(Boolean(config?.activo));
        setComisionServidor(config?.comision || 0);
      })
      .catch(() => setPyaConfigurado(false));
  }, [modoDemo, operaPlataforma]);

  const hoy = dayKey();
  const lista = useMemo(() => pedidos
    .filter(p => canalDe(p) !== 'salon')
    .filter(p => filtro === 'todos' || canalDe(p) === filtro)
    .filter(p => (verCerrados ? !pedidoAbierto(p) && dayKey(p.hora_cierre || p.updated_at) === hoy : pedidoAbierto(p)))
    // Primero lo que espera confirmación de PedidosYa, después por antigüedad.
    .sort((a, b) => {
      const pa = a.externo?.estado_plataforma === 'pendiente' ? 0 : 1;
      const pb = b.externo?.estado_plataforma === 'pendiente' ? 0 : 1;
      return pa - pb || a.hora_apertura.localeCompare(b.hora_apertura);
    }), [pedidos, filtro, verCerrados, hoy]);

  const cuenta = (canal: Filtro) => pedidos.filter(p => canalDe(p) !== 'salon' && pedidoAbierto(p) && (canal === 'todos' || canalDe(p) === canal)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['todos', 'pedidosya', 'mostrador', 'delivery'] as Filtro[]).map(opcion => (
            <button
              key={opcion}
              onClick={() => setFiltro(opcion)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                filtro === opcion ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {opcion === 'todos' ? 'Todos' : nombresCanal[opcion]}
              <span className={`ml-1.5 text-xs ${filtro === opcion ? 'text-slate-300' : 'text-slate-400'}`}>{cuenta(opcion)}</span>
            </button>
          ))}
          <button
            onClick={() => setVerCerrados(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              verCerrados ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {verCerrados ? 'Viendo cerrados de hoy' : 'Ver cerrados de hoy'}
          </button>
        </div>
        <button
          onClick={() => setMostrarNuevo(true)}
          className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <Plus size={16} />Nuevo pedido
        </button>
      </div>

      {!modoDemo && operaPlataforma && pyaConfigurado === false && (
        <p className="text-sm bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-3">
          PedidosYa todavía no está conectado. {user?.rol === 'admin' ? 'Configuralo en Configuración → PedidosYa.' : 'Pedile al administrador que lo configure.'}
        </p>
      )}

      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">{verCerrados ? 'No hay pedidos cerrados hoy' : 'No hay pedidos activos'}</p>
          <p className="text-sm mt-1">Los pedidos de PedidosYa aparecen acá solos. Los de mostrador y delivery se cargan con “Nuevo pedido”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {lista.map(pedido => (
            <TarjetaPedido key={pedido.id} pedido={pedido} ahora={ahora} comision={comision} operaPlataforma={operaPlataforma} />
          ))}
        </div>
      )}

      {mostrarNuevo && <NuevoPedido onCerrar={() => setMostrarNuevo(false)} empleadoId={user?.id} />}
    </div>
  );
}

function TarjetaPedido({ pedido, ahora, comision, operaPlataforma }: { pedido: Pedido; ahora: number; comision: number | null; operaPlataforma: boolean }) {
  const canal = canalDe(pedido) as Exclude<CanalPedido, 'salon'>;
  const estilo = estiloCanal[canal];
  const Icono = estilo.icono;
  const externo = pedido.externo;
  const pendiente = externo?.estado_plataforma === 'pendiente';
  const abierto = pedidoAbierto(pedido);
  const [minutos, setMinutos] = useState(20);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState(motivos[0].id);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const segundosParaVencer = externo?.vence_at ? Math.floor((Date.parse(externo.vence_at) - ahora) / 1000) : null;
  const items = (pedido.items || []).filter(i => i.estado !== 'cancelado');

  const ejecutar = async (accion: AccionPedidosYa, opciones?: { minutos?: number; motivo?: string }) => {
    setOcupado(true);
    setError('');
    setAviso('');
    const resultado = await avisarAPedidosYa(pedido.id, accion, opciones);
    setOcupado(false);
    if (!resultado.ok) setError(resultado.error);
    else if (resultado.aviso) setAviso(resultado.aviso);
    setRechazando(false);
  };

  const local = (accion: () => void) => {
    setError('');
    try { accion(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
  };

  return (
    <div className={`bg-white rounded-2xl border-2 ${pendiente ? 'border-rose-400 shadow-lg shadow-rose-100' : estilo.borde} flex flex-col`}>
      <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${estilo.chip}`}>
              <Icono size={12} />{nombresCanal[canal]}
            </span>
            {externo?.prueba && <span className="text-[11px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">PRUEBA</span>}
            {externo && (
              <span className="text-xs text-slate-500">
                {externo.tipo_entrega === 'retiro' ? 'Retira el cliente' : externo.tipo_entrega === 'delivery_plataforma' ? 'Lo lleva PedidosYa' : 'Lo llevamos nosotros'}
              </span>
            )}
          </div>
          <h3 className="font-bold text-slate-800 mt-1.5 truncate">{etiquetaPedido(pedido)}</h3>
        </div>
        <div className="text-right flex-shrink-0">
          {pendiente && segundosParaVencer !== null ? (
            <p className={`font-mono font-bold text-sm ${segundosParaVencer < 120 ? 'text-red-600 animate-pulse' : 'text-rose-600'}`}>
              {segundosParaVencer > 0
                ? `Vence ${String(Math.floor(segundosParaVencer / 60)).padStart(2, '0')}:${String(segundosParaVencer % 60).padStart(2, '0')}`
                : 'Vencido'}
            </p>
          ) : (
            <p className="flex items-center gap-1 text-sm text-slate-500"><Clock size={13} />{minutosDesde(pedido.hora_apertura, ahora)} min</p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{estadoCocina[pedido.estado] || pedido.estado}</p>
        </div>
      </div>

      <div className="p-4 space-y-3 flex-1">
        {(pedido.cliente_telefono || pedido.direccion_entrega) && (
          <div className="text-sm text-slate-600 space-y-1">
            {pedido.cliente_telefono && <p className="flex items-center gap-1.5"><Phone size={13} className="text-slate-400" />{pedido.cliente_telefono}</p>}
            {pedido.direccion_entrega && <p className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" />{pedido.direccion_entrega}</p>}
          </div>
        )}
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item.id} className="text-sm">
              <span className="font-semibold text-slate-700">{item.cantidad}x</span>{' '}
              <span className="text-slate-800">{item.producto?.nombre}</span>
              {item.observaciones && <span className="block text-xs text-amber-700 ml-5">{item.observaciones}</span>}
            </li>
          ))}
        </ul>
        {pedido.observaciones && <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-2.5 py-1.5">{pedido.observaciones}</p>}
        {!!externo?.sin_reconocer?.length && (
          <p className="text-xs bg-orange-50 text-orange-800 rounded-lg px-2.5 py-1.5 flex gap-1.5">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            Sin equivalente en tu carta (no descuentan stock): {externo.sin_reconocer.join(', ')}. Cargá su código en PedidosYa igual al de Productos.
          </p>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${pedido.cobro === 'plataforma' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {pedido.cobro === 'plataforma' ? 'Pagado en la app' : 'Se cobra en caja'}
          </span>
          <span className="font-bold text-slate-800">{dinero(pedido.total)}</span>
        </div>
      </div>

      {abierto && (
        <div className="p-4 pt-0 space-y-2">
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {aviso && <p className="text-xs text-slate-500">{aviso}</p>}

          {canal === 'pedidosya' && pendiente && operaPlataforma && !rechazando && (
            <div className="flex gap-2">
              <select
                value={minutos}
                onChange={e => setMinutos(Number(e.target.value))}
                className="border border-slate-200 rounded-xl px-2 text-sm"
                aria-label="Tiempo de preparación"
              >
                {[10, 15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
              <button
                disabled={ocupado}
                onClick={() => void ejecutar('aceptar', { minutos })}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                <Check size={15} />{ocupado ? 'Avisando…' : 'Aceptar'}
              </button>
              {externo?.acciones.rechazar && (
                <button
                  disabled={ocupado}
                  onClick={() => setRechazando(true)}
                  className="px-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium"
                >
                  Rechazar
                </button>
              )}
            </div>
          )}

          {rechazando && (
            <div className="space-y-2 bg-red-50 rounded-xl p-3">
              <select value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full border border-red-200 rounded-lg px-2 py-2 text-sm bg-white">
                {motivos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setRechazando(false)} className="flex-1 py-2 border border-slate-200 bg-white rounded-lg text-sm">Volver</button>
                <button
                  disabled={ocupado}
                  onClick={() => void ejecutar('rechazar', { motivo })}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {canal === 'pedidosya' && !pendiente && operaPlataforma && (
            <div className="flex flex-wrap gap-2">
              {/* Según PedidosYa, el aviso de "listo" es solo para sus repartidores. */}
              {externo?.acciones.listo && externo.tipo_entrega === 'delivery_plataforma' && externo.estado_plataforma === 'aceptado' && (
                <button disabled={ocupado} onClick={() => void ejecutar('listo')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                  Avisar que está listo
                </button>
              )}
              {externo?.acciones.retirado && externo.estado_plataforma !== 'retirado' && externo.tipo_entrega !== 'delivery_plataforma' && (
                <button disabled={ocupado} onClick={() => void ejecutar('retirado')}
                  className="flex-1 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium">
                  {externo.tipo_entrega === 'retiro' ? 'Lo retiró el cliente' : 'Salió con el repartidor'}
                </button>
              )}
              {pedido.cobro === 'plataforma' && (
                confirmarCierre ? (
                  <div className="w-full bg-emerald-50 rounded-xl p-3 text-sm space-y-2">
                    {comision === null ? (
                      <p className="text-red-700">No pude leer la comisión de PedidosYa. Revisá la conexión y volvé a abrir la pantalla.</p>
                    ) : (
                      <p className="text-emerald-900">
                        Se descuenta el stock y quedan {dinero(netoPedidosYa(pedido.total, comision))} a cobrar de PedidosYa
                        {comision > 0 ? ` (comisión ${comision}%)` : ''}. No entra en la caja del día.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmarCierre(false)} className="flex-1 py-2 border border-slate-200 bg-white rounded-lg">Volver</button>
                      <button disabled={comision === null} onClick={() => comision !== null && local(() => finalizarPedidoPlataforma(pedido.id, comision))}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold">Confirmar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmarCierre(true)}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-semibold">
                    Finalizar pedido
                  </button>
                )
              )}
            </div>
          )}

          {pedido.cobro !== 'plataforma' && !pendiente && (
            <div className="flex gap-2">
              {canal !== 'pedidosya' && pedido.estado !== 'entregado' && (
                <button onClick={() => local(() => marcarEntregado(pedido.id))}
                  className="flex-1 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium">
                  {canal === 'delivery' ? 'Salió el delivery' : 'Entregado'}
                </button>
              )}
              {/* Mismos roles que entran a Caja: a la moza la pantalla de cobros la rebota. */}
              {operaPlataforma && (
                <a href="#/cobros" className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold text-center">
                  Cobrar en caja
                </a>
              )}
              {canal !== 'pedidosya' && (
                <button onClick={() => local(() => cancelarPedido(pedido.id, ''))} title="Cancelar pedido"
                  className="px-3 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl">
                  <XCircle size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NuevoPedido({ onCerrar, empleadoId }: { onCerrar: () => void; empleadoId?: string }) {
  const productos = useProductos();
  const [canal, setCanal] = useState<'mostrador' | 'delivery'>('mostrador');
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [envio, setEnvio] = useState('');
  const [notas, setNotas] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const [error, setError] = useState('');

  const disponibles = productos.filter(p => p.disponible && !p.agotado && p.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const costoEnvio = canal === 'delivery' ? Math.max(0, Number(envio) || 0) : 0;
  const total = lineas.reduce((s, l) => s + l.producto.precio_venta * l.cantidad, 0) + costoEnvio;

  const agregar = (producto: Producto) => setLineas(prev => (
    prev.some(l => l.producto.id === producto.id)
      ? prev.map(l => (l.producto.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
      : [...prev, { producto, cantidad: 1, observaciones: '' }]
  ));
  const cambiar = (id: string, cambios: Partial<LineaNueva>) =>
    setLineas(prev => prev.map(l => (l.producto.id === id ? { ...l, ...cambios } : l)).filter(l => l.cantidad > 0));

  const crear = () => {
    setError('');
    try {
      crearPedidoLocal({
        canal,
        cliente_nombre: cliente,
        cliente_telefono: telefono,
        direccion_entrega: direccion,
        costo_envio: costoEnvio,
        observaciones: notas,
        empleado_id: empleadoId,
        lineas,
      });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el pedido.');
    }
  };

  const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95dvh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Nuevo pedido</h3>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-0">
          <div className="p-5 space-y-3 md:border-r border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              {(['mostrador', 'delivery'] as const).map(opcion => (
                <button
                  key={opcion}
                  onClick={() => setCanal(opcion)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium ${
                    canal === opcion ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-100 text-slate-600'
                  }`}
                >
                  {opcion === 'mostrador' ? <Store size={15} /> : <Bike size={15} />}
                  {opcion === 'mostrador' ? 'Para llevar' : 'Delivery propio'}
                </button>
              ))}
            </div>
            <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" className={campo} />
            <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono" inputMode="tel" className={campo} />
            {canal === 'delivery' && (
              <>
                <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección de entrega *" className={campo} />
                <input value={envio} onChange={e => setEnvio(e.target.value)} placeholder="Costo de envío" inputMode="decimal" type="number" min="0" className={campo} />
              </>
            )}
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (ej: tocar timbre 3B)" rows={2} className={campo} />

            <div className="border-t border-slate-100 pt-3 space-y-2">
              {lineas.length === 0 && <p className="text-sm text-slate-400">Elegí productos de la lista.</p>}
              {lineas.map(linea => (
                <div key={linea.producto.id} className="bg-slate-50 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-slate-800 truncate">{linea.producto.nombre}</span>
                    <button onClick={() => cambiar(linea.producto.id, { cantidad: linea.cantidad - 1 })} className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center" aria-label="Quitar uno"><Minus size={10} /></button>
                    <span className="w-5 text-center text-sm font-bold">{linea.cantidad}</span>
                    <button onClick={() => cambiar(linea.producto.id, { cantidad: linea.cantidad + 1 })} className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center" aria-label="Agregar uno"><Plus size={10} /></button>
                    <span className="w-20 text-right text-sm font-semibold">{dinero(linea.producto.precio_venta * linea.cantidad)}</span>
                    <button onClick={() => cambiar(linea.producto.id, { cantidad: 0 })} className="text-red-400 hover:text-red-600" aria-label="Quitar producto"><Trash2 size={14} /></button>
                  </div>
                  <input
                    value={linea.observaciones}
                    onChange={e => cambiar(linea.producto.id, { observaciones: e.target.value })}
                    placeholder="Aclaración para cocina"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 flex flex-col min-h-[18rem]">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
              <Search size={14} className="text-slate-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto..." className="bg-transparent text-sm outline-none flex-1" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[50vh]">
              {disponibles.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">
                  {productos.length === 0 ? 'Todavía no hay productos cargados.' : 'Sin resultados.'}
                </p>
              )}
              {disponibles.map(producto => (
                <button
                  key={producto.id}
                  onClick={() => agregar(producto)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-amber-50 hover:border-amber-200 text-left"
                >
                  <span className="text-sm text-slate-800">{producto.nombre}</span>
                  <span className="text-sm font-semibold text-slate-700">{dinero(producto.precio_venta)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 space-y-3">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {costoEnvio > 0 && <span className="mr-3">Envío {dinero(costoEnvio)}</span>}
              <span className="text-lg font-bold text-slate-800">Total {dinero(total)}</span>
            </div>
            <button
              onClick={crear}
              disabled={!lineas.length}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
            >
              Crear y mandar a cocina
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
