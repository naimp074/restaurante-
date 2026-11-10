import { useEffect, useMemo, useState } from 'react';
import { Users, Clock, Plus, X, Check, Pencil, Trash2, PenSquare } from 'lucide-react';
import type { EstadoMesa, Mesa } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import {
  crearMesa,
  loadMesas,
  loadSectores,
  saveMesas,
  saveSectores,
  siguienteNumeroMesa,
  useMesas,
  useSectores,
  type SectorOption,
} from '../lib/mesasStore';
import { usePedidos } from '../lib/demoStore';
import { nuevoId } from '../lib/ids';
import {
  detalleDePedido,
  estadoMesaConfig,
  estadoVisualMesa,
  minutosAbierta,
  pedidoAbiertoDeMesa,
  textoDuracion,
} from '../lib/estadoMesa';
import { layoutsDelSector, planoValido } from '../lib/planoMesas';
import PlanoInteractivo from '../components/plano/PlanoInteractivo';
import EditorPlano from '../components/plano/EditorPlano';
import PanelMesa from '../components/plano/PanelMesa';
import { armarMesaEnPlano, nombreDeMesa } from '../components/plano/datosPlano';

const createSectorId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Mesas cuyo apartado ya no existe: se siguen mostrando para que no se pierdan. */
const SIN_APARTADO = '__sin_apartado';

/** El reloj de las mesas ocupadas avanza solo, sin esperar a que cambie algo. */
const useAhora = (cadaMs: number) => {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(intervalo);
  }, [cadaMs]);
  return ahora;
};

export default function Mesas() {
  const { user } = useAuth();
  const mesas = useMesas();
  const pedidos = usePedidos();
  const sectores = useSectores();
  const ahora = useAhora(30_000);
  const [sectorFiltro, setSectorFiltro] = useState<string>('todos');
  const [mesaAbierta, setMesaAbierta] = useState<{ id: string; configurar?: boolean } | null>(null);
  const [editandoPlano, setEditandoPlano] = useState(false);
  const [showAddSector, setShowAddSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  // Solo quien puede cambiar los apartados (admin y encargado, igual que en Supabase) edita planos.
  const puedeEditarPlano = user?.rol === 'admin' || user?.rol === 'encargado';

  const apartados = sectores.filter(s => s.id !== 'todos');
  const huerfanas = mesas.filter(m => !apartados.some(s => s.id === m.sector));
  const sectorActual: SectorOption | undefined = sectorFiltro === SIN_APARTADO
    ? { id: SIN_APARTADO, label: 'Sin apartado' }
    : apartados.find(s => s.id === sectorFiltro);
  const vistaTodos = !sectorActual;

  const estados = useMemo(
    () => new Map(mesas.map(mesa => [mesa.id, estadoVisualMesa(mesa, pedidos)])),
    [mesas, pedidos],
  );
  const estadoDe = (mesa: Mesa): EstadoMesa => estados.get(mesa.id) ?? 'libre';

  const mesasDe = (sectorId: string) => (sectorId === SIN_APARTADO ? huerfanas : mesas.filter(m => m.sector === sectorId));

  const planoDe = (sector: SectorOption) => {
    const plano = planoValido(sector.plano);
    const propias = mesasDe(sector.id);
    const layouts = layoutsDelSector(propias, plano);
    return { plano, enPlano: propias.map(mesa => armarMesaEnPlano(mesa, layouts.get(mesa.id)!, pedidos, ahora)) };
  };

  const handleAddMesa = () => {
    const sectorDestino = sectorActual && sectorActual.id !== SIN_APARTADO
      ? sectorActual.id
      : apartados[0]?.id ?? 'salon';
    const nuevaMesa = crearMesa(siguienteNumeroMesa(loadMesas()), sectorDestino);
    saveMesas([...loadMesas(), nuevaMesa]);
    setMesaAbierta({ id: nuevaMesa.id, configurar: true });
  };

  const setSectores = (update: (prev: SectorOption[]) => SectorOption[]) => saveSectores(update(loadSectores()));

  const handleAddSector = () => {
    const label = newSectorName.trim();
    if (!label) return;

    const baseId = createSectorId(label) || nuevoId('sector');
    const id = sectores.some(s => s.id === baseId) ? nuevoId(baseId) : baseId;

    setSectores(prev => [...prev, { id, label }]);
    setSectorFiltro(id);
    setNewSectorName('');
    setShowAddSector(false);
  };

  const startEditingSector = (sector: SectorOption) => {
    setEditingSectorId(sector.id);
    setEditingSectorName(sector.label);
    setShowAddSector(false);
    setNewSectorName('');
  };

  const handleUpdateSector = () => {
    if (!editingSectorId) return;

    const label = editingSectorName.trim();
    if (!label) return;

    setSectores(prev => prev.map(s => (s.id === editingSectorId ? { ...s, label } : s)));
    setEditingSectorId(null);
    setEditingSectorName('');
  };

  const handleDeleteSector = (sectorId: string) => {
    if (sectorId === 'todos') return;

    const sectorHasMesas = mesas.some(m => m.sector === sectorId);
    if (sectorHasMesas && !window.confirm('Este apartado tiene mesas asignadas. ¿Querés borrarlo igual?')) {
      return;
    }

    setSectores(prev => prev.filter(s => s.id !== sectorId));
    if (sectorFiltro === sectorId) {
      setSectorFiltro('todos');
    }
    if (editingSectorId === sectorId) {
      setEditingSectorId(null);
      setEditingSectorName('');
    }
  };

  const stats = {
    libres: mesas.filter(m => estadoDe(m) === 'libre').length,
    ocupadas: mesas.filter(m => estadoDe(m) !== 'libre' && estadoDe(m) !== 'cerrada').length,
    porcobrar: mesas.filter(m => estadoDe(m) === 'pendiente_cobro').length,
  };

  const tooltipDe = (mesaId: string) => {
    const mesa = mesas.find(m => m.id === mesaId);
    if (!mesa) return null;
    const estado = estadoDe(mesa);
    const config = estadoMesaConfig[estado];
    const pedido = estado === 'libre' || estado === 'cerrada' ? undefined : pedidoAbiertoDeMesa(mesa.id, pedidos);
    const detalle = pedido ? detalleDePedido(pedido) : undefined;
    return (
      <>
        <p className="text-sm font-bold text-slate-800">{nombreDeMesa(mesa)}</p>
        <p className={`mt-0.5 flex items-center gap-1.5 font-semibold ${config.color}`}>
          <span className={`h-2 w-2 rounded-full ${config.dot}`} />{config.label}
        </p>
        {detalle && <p className="mt-0.5 text-slate-500">{detalle}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-slate-500">
          {pedido ? (
            <>
              <dt>Personas</dt><dd className="text-right font-medium text-slate-700">{pedido.cantidad_personas}</dd>
              <dt>Ocupada hace</dt><dd className="text-right font-medium text-slate-700">{textoDuracion(minutosAbierta(pedido, ahora))}</dd>
              <dt>Consumo</dt><dd className="text-right font-medium text-slate-700">${pedido.total.toLocaleString('es-AR')}</dd>
            </>
          ) : (
            <><dt>Capacidad</dt><dd className="text-right font-medium text-slate-700">{mesa.capacidad} personas</dd></>
          )}
        </dl>
      </>
    );
  };

  const mesaPanel = mesaAbierta ? mesas.find(m => m.id === mesaAbierta.id) : undefined;
  const estadoPanel = mesaPanel ? estadoDe(mesaPanel) : 'libre';

  const resumenSectores: SectorOption[] = [...apartados, ...(huerfanas.length ? [{ id: SIN_APARTADO, label: 'Sin apartado' }] : [])];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3">
          <div className="hidden sm:flex w-10 h-10 bg-emerald-100 rounded-xl items-center justify-center">
            <div className="w-3 h-3 bg-emerald-500 rounded-full" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.libres}</p>
            <p className="text-xs text-slate-500">Mesas libres</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3">
          <div className="hidden sm:flex w-10 h-10 bg-blue-100 rounded-xl items-center justify-center">
            <Users size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.ocupadas}</p>
            <p className="text-xs text-slate-500">Mesas en uso</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3">
          <div className="hidden sm:flex w-10 h-10 bg-red-100 rounded-xl items-center justify-center">
            <Clock size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.porcobrar}</p>
            <p className="text-xs text-slate-500">Por cobrar</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
        {editandoPlano && sectorActual && sectorActual.id !== SIN_APARTADO ? (
          <EditorPlano
            key={sectorActual.id}
            sector={sectorActual}
            mesas={mesas}
            pedidos={pedidos}
            onSalir={() => setEditandoPlano(false)}
          />
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-semibold text-slate-800">Plano del Local</h2>
                <p className="text-sm text-slate-500">
                  {vistaTodos ? 'Elegí un apartado para ver su plano' : 'Tocá una mesa para gestionarla'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 bg-slate-100 rounded-xl p-1">
            {sectores.map(s => (
              editingSectorId === s.id ? (
                <div key={s.id} className="flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
                  <input
                    autoFocus
                    value={editingSectorName}
                    onChange={e => setEditingSectorName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleUpdateSector();
                      if (e.key === 'Escape') {
                        setEditingSectorId(null);
                        setEditingSectorName('');
                      }
                    }}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={handleUpdateSector}
                    className="w-6 h-6 rounded-md bg-amber-500 text-white flex items-center justify-center hover:bg-amber-400 transition-colors"
                    aria-label="Guardar nombre del apartado"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingSectorId(null);
                      setEditingSectorName('');
                    }}
                    className="w-6 h-6 rounded-md text-slate-500 flex items-center justify-center hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    aria-label="Cancelar edición del apartado"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div
                  key={s.id}
                  className={`group flex items-center rounded-lg transition-all ${
                    sectorFiltro === s.id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                  }`}
                >
                  <button
                    onClick={() => setSectorFiltro(s.id)}
                    className="px-3 py-1.5 text-xs font-medium"
                  >
                    {s.label}
                  </button>
                  {s.id !== 'todos' && sectorFiltro === s.id && (
                    <div className="flex items-center pr-1">
                      <button
                        onClick={() => startEditingSector(s)}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100"
                        aria-label={`Editar apartado ${s.label}`}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteSector(s.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-red-500 hover:bg-red-50"
                        aria-label={`Borrar apartado ${s.label}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )
            ))}
            {showAddSector ? (
              <div className="flex items-center gap-1 pl-1">
                <input
                  autoFocus
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSector();
                    if (e.key === 'Escape') {
                      setShowAddSector(false);
                      setNewSectorName('');
                    }
                  }}
                  placeholder="Nuevo apartado"
                  className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleAddSector}
                  className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-400 transition-colors"
                  aria-label="Guardar apartado"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => {
                    setShowAddSector(false);
                    setNewSectorName('');
                  }}
                  className="w-7 h-7 rounded-lg text-slate-500 flex items-center justify-center hover:bg-white hover:text-slate-700 transition-colors"
                  aria-label="Cancelar apartado"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddSector(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 hover:bg-white hover:shadow-sm transition-all flex items-center gap-1"
              >
                <Plus size={12} />
                Agregar apartado
              </button>
            )}
          </div>

              <div className="flex gap-2">
                {puedeEditarPlano && sectorActual && sectorActual.id !== SIN_APARTADO && (
                  <button
                    onClick={() => { setMesaAbierta(null); setEditandoPlano(true); }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    <PenSquare size={16} />
                    Editar plano
                  </button>
                )}
                <button
                  onClick={handleAddMesa}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
                >
                  <Plus size={16} />
                  Nueva mesa
                </button>
              </div>
            </div>

            {mesas.length === 0 && (vistaTodos || !planoValido(sectorActual?.plano).elementos.length) ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">Todavía no hay mesas cargadas</p>
                <p className="text-xs text-slate-500 mt-1">
                  Usá el botón "Nueva mesa" para armar el salón como está en tu local
                  {puedeEditarPlano ? ', o entrá a un apartado y tocá "Editar plano" para usar el plano de referencia.' : '.'}
                </p>
              </div>
            ) : vistaTodos ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {resumenSectores.map(sector => {
                  const { plano, enPlano } = planoDe(sector);
                  const libres = enPlano.filter(m => m.estado === 'libre').length;
                  const enUso = enPlano.filter(m => m.estado !== 'libre' && m.estado !== 'cerrada').length;
                  const porCobrar = enPlano.filter(m => m.estado === 'pendiente_cobro').length;
                  return (
                    <button
                      key={sector.id}
                      type="button"
                      onClick={() => setSectorFiltro(sector.id)}
                      className="group rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-amber-300 hover:shadow-md"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{sector.label}</span>
                        <span className="text-xs text-slate-500">{enPlano.length} mesas</span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-1.5">
                        <PlanoInteractivo plano={plano} mesas={enPlano} estatico altoMaximo="190px" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{libres} libres</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{enUso} en uso</span>
                        {porCobrar > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{porCobrar} por cobrar</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (() => {
              const { plano, enPlano } = planoDe(sectorActual);
              return (
                <div className="space-y-3">
                  {enPlano.length === 0 && (
                    <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                      No hay mesas en {sectorActual.label}. Usá "Nueva mesa"{puedeEditarPlano ? ' o "Editar plano"' : ''} para agregarlas.
                    </p>
                  )}
                  <PlanoInteractivo
                    key={sectorActual.id}
                    plano={plano}
                    mesas={enPlano}
                    onTocarMesa={id => setMesaAbierta({ id })}
                    tooltip={tooltipDe}
                  />
                  {sectorActual.id === SIN_APARTADO && (
                    <p className="text-xs text-slate-500">Estas mesas son de un apartado que ya no existe. Tocá una y elegí su apartado en la configuración.</p>
                  )}
                </div>
              );
            })()}

            <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(estadoMesaConfig).map(([estado, cfg]) => (
                <div key={estado} className="flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-3.5 rounded-[4px] border-2"
                    style={{ background: cfg.colores.relleno, borderColor: cfg.colores.borde }}
                  />
                  <span className="text-xs text-slate-600">{cfg.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {mesaPanel && (
        <PanelMesa
          key={mesaPanel.id}
          mesa={mesaPanel}
          estado={estadoPanel}
          pedido={estadoPanel === 'libre' || estadoPanel === 'cerrada' ? undefined : pedidoAbiertoDeMesa(mesaPanel.id, pedidos)}
          sectores={sectores}
          ahora={ahora}
          configurar={mesaAbierta?.configurar}
          onClose={() => setMesaAbierta(null)}
        />
      )}
    </div>
  );
}
