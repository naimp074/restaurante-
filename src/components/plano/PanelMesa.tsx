import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock, CreditCard, Receipt, Settings2, Trash2, Users, UtensilsCrossed, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { loadDemoPedidos, saveDemoPedidos } from '../../lib/demoStore';
import { detalleDePedido, estadoMesaConfig, minutosAbierta, textoDuracion } from '../../lib/estadoMesa';
import { pedirAbrirMesa, pedirCobrarPedido } from '../../lib/mesaAAbrir';
import { loadMesas, mesaTienePedidoAbierto, saveMesas, type SectorOption } from '../../lib/mesasStore';
import { hashDePagina, perfilVePagina } from '../../lib/paginas';
import type { EstadoMesa, Mesa, PageId, Pedido, Sector } from '../../lib/types';
import { useMozas } from '../../lib/usuariosStore';
import { nombreDeMesa } from './datosPlano';

type Props = {
  mesa: Mesa;
  estado: EstadoMesa;
  pedido?: Pedido;
  sectores: SectorOption[];
  ahora: number;
  /** Recién creada: se abre directo en la configuración. */
  configurar?: boolean;
  onClose: () => void;
};

const plata = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

const estadoItem: Record<string, string> = {
  pendiente: 'Sin enviar',
  en_preparacion: 'En cocina',
  listo: 'Listo',
  entregado: 'Entregado',
};

/**
 * Lo que se abre al tocar una mesa del plano. La comanda y el cobro se hacen en sus
 * pantallas de siempre (Comandas y Cobros): acá solo se resume y se lleva hasta ahí.
 */
export default function PanelMesa({ mesa, estado, pedido, sectores, ahora, configurar, onClose }: Props) {
  const { user } = useAuth();
  const mozas = useMozas();
  const [verConfig, setVerConfig] = useState(Boolean(configurar));
  const [nombre, setNombre] = useState(mesa.nombre || '');
  const [capacidad, setCapacidad] = useState(mesa.capacidad);
  const [sector, setSector] = useState<string>(mesa.sector);
  const [disponible, setDisponible] = useState(mesa.estado !== 'cerrada');
  const [moza, setMoza] = useState(mesa.empleado_id || '');
  const [personas, setPersonas] = useState(Math.min(2, Math.max(1, mesa.capacidad)));
  const [mozaApertura, setMozaApertura] = useState(mesa.empleado_id || (user?.rol === 'moza' ? user.id : ''));

  const config = estadoMesaConfig[estado];
  const paginaComandas: PageId | null = user && perfilVePagina(user, 'pedidos') ? 'pedidos' : user && perfilVePagina(user, 'ventas') ? 'ventas' : null;
  const puedeCobrar = Boolean(user && perfilVePagina(user, 'cobros'));
  const items = (pedido?.items || []).filter(item => item.estado !== 'cancelado');
  const detalle = pedido ? detalleDePedido(pedido) : undefined;
  const mozaDelPedido = pedido?.empleado?.nombre || mozas.find(m => m.id === pedido?.empleado_id)?.nombre;
  const apartados = sectores.filter(s => s.id !== 'todos');

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  const irA = (pagina: PageId) => {
    onClose();
    window.location.hash = hashDePagina(pagina);
  };

  const abrirComanda = () => {
    if (!paginaComandas) return;
    pedirAbrirMesa(pedido ? { mesaId: mesa.id } : { mesaId: mesa.id, personas, mozaId: mozaApertura || undefined });
    irA(paginaComandas);
  };

  const cobrar = () => {
    if (!pedido || !puedeCobrar) return;
    pedirCobrarPedido(pedido.id);
    irA('cobros');
  };

  const marcarCuenta = (pedida: boolean) => {
    if (!pedido) return;
    const momento = new Date().toISOString();
    saveDemoPedidos(loadDemoPedidos().map(p => (
      p.id === pedido.id ? { ...p, cuenta_pedida_at: pedida ? momento : undefined, updated_at: momento } : p
    )));
  };

  const guardarConfig = () => {
    const empleado = mozas.find(m => m.id === moza);
    saveMesas(loadMesas().map(m => (
      m.id === mesa.id
        ? {
            ...m,
            nombre: nombre.trim() || undefined,
            capacidad: Math.max(1, capacidad),
            sector: (sector || m.sector) as Sector,
            // Ocupada o libre lo marcan las comandas: acá solo se la saca de servicio.
            estado: disponible ? 'libre' : 'cerrada',
            empleado_id: moza || undefined,
            empleado,
            // Si cambia de apartado, en el plano nuevo se ubica sola hasta que la acomoden.
            plano: sector !== m.sector ? undefined : m.plano,
            updated_at: new Date().toISOString(),
          }
        : m
    )));
    onClose();
  };

  const borrar = () => {
    if (mesaTienePedidoAbierto(mesa.id, loadDemoPedidos())) {
      window.alert('No se puede borrar: hay una comanda abierta en esta mesa.');
      return;
    }
    if (!window.confirm(`¿Querés borrar ${nombreDeMesa(mesa)}?`)) return;
    saveMesas(loadMesas().filter(m => m.id !== mesa.id));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{nombreDeMesa(mesa)}</h3>
            <p className="text-sm text-slate-500">
              {sectores.find(s => s.id === mesa.sector)?.label ?? mesa.sector} · {mesa.capacidad} personas
            </p>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.color}`}>
              <span className={`h-2 w-2 rounded-full ${config.dot}`} />
              {config.label}
            </span>
            {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {pedido ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <Users size={14} className="mx-auto text-slate-400" />
                <p className="mt-1 text-sm font-bold text-slate-800">{pedido.cantidad_personas}</p>
                <p className="text-[11px] text-slate-500">personas</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <Clock size={14} className="mx-auto text-slate-400" />
                <p className="mt-1 text-sm font-bold text-slate-800">{textoDuracion(minutosAbierta(pedido, ahora))}</p>
                <p className="text-[11px] text-slate-500">abierta</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <Receipt size={14} className="mx-auto text-slate-400" />
                <p className="mt-1 text-sm font-bold text-slate-800">{plata(pedido.total)}</p>
                <p className="text-[11px] text-slate-500">consumo</p>
              </div>
            </div>
            {mozaDelPedido && <p className="text-xs text-slate-500">Atiende: <span className="font-medium text-slate-700">{mozaDelPedido}</span></p>}

            <div className="rounded-xl border border-slate-100">
              {items.length ? (
                <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                  {items.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700">
                        <span className="font-semibold">{item.cantidad}×</span> {item.producto?.nombre ?? 'Producto'}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-slate-400">{estadoItem[item.estado] ?? item.estado}</span>
                        <span className="font-medium text-slate-700">{plata(item.subtotal)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-center text-xs text-slate-500">La comanda está abierta, todavía sin productos.</p>
              )}
            </div>

            <div className="grid gap-2">
              {paginaComandas && (
                <button type="button" onClick={abrirComanda} className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-400">
                  <UtensilsCrossed size={16} />Ver comanda y agregar productos
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => marcarCuenta(!pedido.cuenta_pedida_at)}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium ${pedido.cuenta_pedida_at ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <Receipt size={15} />{pedido.cuenta_pedida_at ? 'Quitar "pidió la cuenta"' : 'Pidió la cuenta'}
                </button>
                {puedeCobrar ? (
                  <button type="button" onClick={cobrar} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                    <CreditCard size={15} />Cobrar
                  </button>
                ) : (
                  <p className="flex items-center justify-center rounded-xl bg-slate-50 px-2 text-center text-[11px] text-slate-500">El cobro lo hace caja</p>
                )}
              </div>
            </div>
          </div>
        ) : estado === 'cerrada' ? (
          <p className="p-5 text-sm text-slate-500">La mesa está fuera de servicio. Para volver a usarla, cambiá su disponibilidad en la configuración.</p>
        ) : paginaComandas ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Personas</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPersonas(p => Math.max(1, p - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">-</button>
                  <span className="w-8 text-center text-xl font-bold text-slate-800">{personas}</span>
                  <button type="button" onClick={() => setPersonas(p => Math.min(Math.max(mesa.capacidad, 1), p + 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">+</button>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Moza</span>
                <select value={mozaApertura} onChange={e => setMozaApertura(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400">
                  <option value="">Sin asignar</option>
                  {mozas.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
                </select>
              </label>
            </div>
            <button type="button" onClick={abrirComanda} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-400">
              <UtensilsCrossed size={16} />Abrir mesa y cargar pedido
            </button>
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">La mesa está libre.</p>
        )}

        <div className="border-t border-slate-100">
          <button type="button" onClick={() => setVerConfig(v => !v)} className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50" aria-expanded={verConfig}>
            <span className="flex items-center gap-2"><Settings2 size={15} className="text-slate-400" />Configuración de la mesa</span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${verConfig ? 'rotate-180' : ''}`} />
          </button>
          {verConfig && (
            <div className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre de la mesa</span>
                  <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`M${mesa.numero}`} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Capacidad</span>
                  <input type="number" min={1} value={capacidad} onChange={e => setCapacidad(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
                </label>
              </div>
              {apartados.length > 0 && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Apartado</span>
                  <select value={sector} onChange={e => setSector(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400">
                    {!apartados.some(s => s.id === mesa.sector) && <option value={mesa.sector}>{mesa.sector} (sin apartado)</option>}
                    {apartados.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              )}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Disponibilidad</span>
                <p className="mb-2 text-xs text-slate-500">Ocupada o libre lo marcan las comandas. Acá solo podés dejarla fuera de servicio.</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ valor: true, label: 'Operativa', estilo: estadoMesaConfig.libre }, { valor: false, label: 'Fuera de servicio', estilo: estadoMesaConfig.cerrada }].map(opcion => (
                    <button
                      key={opcion.label}
                      type="button"
                      onClick={() => setDisponible(opcion.valor)}
                      className={`rounded-xl border-2 px-3 py-2 text-xs font-medium transition-all ${disponible === opcion.valor ? `${opcion.estilo.bg} border-current ${opcion.estilo.color}` : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Moza asignada</span>
                <select value={moza} onChange={e => setMoza(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400">
                  <option value="">Sin asignar</option>
                  {mozas.map(m => <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>)}
                </select>
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={borrar} className="flex items-center justify-center gap-2 rounded-xl border border-red-100 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
                  <Trash2 size={15} />Borrar
                </button>
                <button type="button" onClick={guardarConfig} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-400">
                  <Check size={16} />Guardar cambios
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
