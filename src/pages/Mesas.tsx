import { useEffect, useState } from 'react';
import { Users, Clock, Plus, X, Check, Pencil, Trash2 } from 'lucide-react';
import type { Mesa, EstadoMesa } from '../lib/types';
import { useMozas } from '../lib/usuariosStore';
import {
  loadMesas,
  loadSectores,
  saveMesas,
  saveSectores,
  type SectorOption,
} from '../lib/mesasStore';

const estadoConfig: Record<EstadoMesa, { label: string; color: string; dot: string; bg: string }> = {
  libre: { label: 'Libre', color: 'text-emerald-700', dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
  ocupada: { label: 'Ocupada', color: 'text-blue-700', dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-300' },
  esperando_pedido: { label: 'Esperando pedido', color: 'text-yellow-700', dot: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-300' },
  en_preparacion: { label: 'En preparación', color: 'text-orange-700', dot: 'bg-orange-500', bg: 'bg-orange-50 border-orange-300' },
  servida: { label: 'Pedido servido', color: 'text-violet-700', dot: 'bg-violet-500', bg: 'bg-violet-50 border-violet-300' },
  pendiente_cobro: { label: 'Pendiente cobro', color: 'text-red-700', dot: 'bg-red-500', bg: 'bg-red-50 border-red-300' },
  cerrada: { label: 'Cerrada', color: 'text-slate-600', dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200' },
};

const createSectorId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const getSectorLabel = (sector: string, sectores: SectorOption[]) =>
  sectores.find(s => s.id === sector)?.label ?? sector;

const getMesaLabel = (mesa: Mesa) => mesa.nombre || `M${mesa.numero}`;

export default function Mesas() {
  const [mesas, setMesas] = useState<Mesa[]>(loadMesas);
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null);
  const [sectorFiltro, setSectorFiltro] = useState<string>('todos');
  const [showModal, setShowModal] = useState(false);
  const [modalMesa, setModalMesa] = useState<Mesa | null>(null);
  const [editMesaName, setEditMesaName] = useState('');
  const [editMesaCapacidad, setEditMesaCapacidad] = useState(1);
  const [editPersonas, setEditPersonas] = useState(1);
  const [editMoza, setEditMoza] = useState('');
  const [editEstado, setEditEstado] = useState<EstadoMesa>('libre');
  const [sectores, setSectores] = useState<SectorOption[]>(loadSectores);
  const [showAddSector, setShowAddSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  const filteredMesas = mesas.filter(m => sectorFiltro === 'todos' || m.sector === sectorFiltro);
  const mozas = useMozas();

  useEffect(() => {
    saveSectores(sectores);
  }, [sectores]);

  useEffect(() => {
    saveMesas(mesas);
  }, [mesas]);

  const openModal = (mesa: Mesa) => {
    setModalMesa(mesa);
    setEditMesaName(getMesaLabel(mesa));
    setEditMesaCapacidad(mesa.capacidad);
    setEditEstado(mesa.estado);
    setEditMoza(mesa.empleado_id || '');
    setEditPersonas(1);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!modalMesa) return;
    const empleado = mozas.find(m => m.id === editMoza);
    const nombre = editMesaName.trim();
    const capacidad = Math.max(1, editMesaCapacidad);

    setMesas(prev => prev.map(m =>
      m.id === modalMesa.id
        ? {
            ...m,
            nombre: nombre || undefined,
            capacidad,
            estado: editEstado,
            empleado_id: editMoza || undefined,
            empleado,
          }
        : m
    ));
    setShowModal(false);
    setModalMesa(null);
  };

  const handleDeleteMesa = () => {
    if (!modalMesa) return;
    if (!window.confirm(`¿Querés borrar ${getMesaLabel(modalMesa)}?`)) return;

    setMesas(prev => prev.filter(m => m.id !== modalMesa.id));
    setSelectedMesa(prev => (prev?.id === modalMesa.id ? null : prev));
    setShowModal(false);
    setModalMesa(null);
  };

  const handleAbrirMesa = (mesa: Mesa) => {
    if (mesa.estado !== 'libre') return;
    openModal(mesa);
  };

  const handleAddSector = () => {
    const label = newSectorName.trim();
    if (!label) return;

    const baseId = createSectorId(label) || `apartado-${Date.now()}`;
    const id = sectores.some(s => s.id === baseId) ? `${baseId}-${Date.now()}` : baseId;

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

    setSectores(prev => prev.map(s => (
      s.id === editingSectorId ? { ...s, label } : s
    )));
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
    libres: mesas.filter(m => m.estado === 'libre').length,
    ocupadas: mesas.filter(m => m.estado !== 'libre' && m.estado !== 'cerrada').length,
    porcobrar: mesas.filter(m => m.estado === 'pendiente_cobro').length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <div className="w-3 h-3 bg-emerald-500 rounded-full" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.libres}</p>
            <p className="text-xs text-slate-500">Mesas libres</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.ocupadas}</p>
            <p className="text-xs text-slate-500">Mesas en uso</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Clock size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.porcobrar}</p>
            <p className="text-xs text-slate-500">Por cobrar</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-slate-800">Plano del Local</h2>
            <p className="text-sm text-slate-500">Seleccioná una mesa para gestionar</p>
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
        </div>

        {filteredMesas.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {filteredMesas.map(mesa => {
              const cfg = estadoConfig[mesa.estado];
              const isSelected = selectedMesa?.id === mesa.id;
              return (
                <button
                  key={mesa.id}
                  onClick={() => {
                    setSelectedMesa(mesa);
                    if (mesa.estado === 'libre') handleAbrirMesa(mesa);
                    else openModal(mesa);
                  }}
                  className={`relative p-4 rounded-2xl border-2 transition-all duration-200 text-left hover:scale-105 hover:shadow-md ${cfg.bg} ${
                    isSelected ? 'ring-2 ring-amber-500 ring-offset-2' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-bold text-slate-800">{getMesaLabel(mesa)}</span>
                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
                  </div>
                  <div className={`text-xs font-semibold mb-2 ${cfg.color}`}>{cfg.label}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Users size={10} />
                    <span>{mesa.capacidad} pers.</span>
                  </div>
                  {mesa.empleado && (
                    <div className="mt-2 text-xs text-slate-600 truncate font-medium">
                      {mesa.empleado.nombre}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 mt-0.5">{getSectorLabel(mesa.sector, sectores)}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
            {mesas.length === 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-700">Todavía no hay mesas cargadas</p>
                <p className="text-xs text-slate-500 mt-1">
                  Usá el botón "Nueva mesa" para armar el salón como está en tu local.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  No hay mesas en {getSectorLabel(sectorFiltro, sectores)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Las mesas que se asignen a este sector van a aparecer acá.
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-3">
          {Object.entries(estadoConfig).map(([estado, cfg]) => (
            <div key={estado} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {showModal && modalMesa && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{getMesaLabel(modalMesa)}</h3>
                <p className="text-sm text-slate-500">{getSectorLabel(modalMesa.sector, sectores)} · {modalMesa.capacidad} personas</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de la mesa</label>
                  <input
                    value={editMesaName}
                    onChange={e => setEditMesaName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder={`M${modalMesa.numero}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidad</label>
                  <input
                    type="number"
                    min={1}
                    value={editMesaCapacidad}
                    onChange={e => setEditMesaCapacidad(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado de la Mesa</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(estadoConfig) as EstadoMesa[]).map(est => (
                    <button
                      key={est}
                      onClick={() => setEditEstado(est)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                        editEstado === est
                          ? `${estadoConfig[est].bg} border-current ${estadoConfig[est].color}`
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {estadoConfig[est].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Moza asignada</label>
                <select
                  value={editMoza}
                  onChange={e => setEditMoza(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  <option value="">Sin asignar</option>
                  {mozas.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                  ))}
                </select>
              </div>

              {editEstado !== 'libre' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad de personas</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditPersonas(p => Math.max(1, p - 1))}
                      className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                    >-</button>
                    <span className="text-xl font-bold text-slate-800 w-8 text-center">{editPersonas}</span>
                    <button
                      onClick={() => setEditPersonas(p => Math.min(editMesaCapacidad, p + 1))}
                      className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                    >+</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={handleDeleteMesa}
                className="py-2.5 px-3 rounded-xl border border-red-100 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={15} />
                Borrar
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
