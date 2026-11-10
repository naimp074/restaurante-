import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { GrupoOpciones, OpcionElegida, Producto } from '../lib/types';
import { alternarOpcion, gruposDe, gruposFaltantes, opcionesElegidas, precioConOpciones, textoOpciones, type SeleccionOpciones } from '../lib/opcionesProducto';
import { nuevoId } from '../lib/ids';

const dinero = (valor: number) => `$${valor.toLocaleString('es-AR')}`;

/** Debajo del nombre del ítem: lo que eligió y la aclaración, tal como va a salir. */
export function DetalleItem({ opciones, observaciones, className = '' }: { opciones?: OpcionElegida[]; observaciones?: string; className?: string }) {
  const texto = textoOpciones(opciones);
  if (!texto && !observaciones) return null;
  return (
    <div className={`text-xs mt-0.5 space-y-0.5 ${className}`}>
      {texto && <p className="text-slate-600">{texto}</p>}
      {observaciones && <p className="text-amber-600">* {observaciones}</p>}
    </div>
  );
}

const seleccionDesde = (producto: Producto, opciones: OpcionElegida[] = []): SeleccionOpciones => {
  const seleccion: SeleccionOpciones = {};
  gruposDe(producto).forEach(grupo => {
    const ids = grupo.opciones
      .filter(op => opciones.some(e => e.grupo === grupo.nombre && e.opcion === op.nombre))
      .map(op => op.id);
    if (ids.length) seleccion[grupo.id] = ids;
  });
  return seleccion;
};

/** Se abre al agregar un producto (o al tocar "Aclarar") para elegir cómo sale. */
export function ElegirOpciones({
  producto, opcionesIniciales, observacionesIniciales = '', cantidad = 1, textoConfirmar = 'Agregar al pedido', onConfirmar, onCerrar,
}: {
  producto: Producto;
  opcionesIniciales?: OpcionElegida[];
  observacionesIniciales?: string;
  cantidad?: number;
  textoConfirmar?: string;
  onConfirmar: (opciones: OpcionElegida[], observaciones: string) => void;
  onCerrar: () => void;
}) {
  const grupos = gruposDe(producto);
  const [seleccion, setSeleccion] = useState<SeleccionOpciones>(() => seleccionDesde(producto, opcionesIniciales));
  const [observaciones, setObservaciones] = useState(observacionesIniciales);
  const elegidas = opcionesElegidas(producto, seleccion);
  const faltan = gruposFaltantes(producto, seleccion);
  const precio = precioConOpciones(producto.precio_venta, elegidas);

  const confirmar = () => {
    if (faltan.length) return;
    onConfirmar(elegidas, observaciones.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">{producto.nombre}</h3>
            <p className="text-sm text-slate-500">{dinero(producto.precio_venta)}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {grupos.map(grupo => {
            const elegidasGrupo = seleccion[grupo.id] || [];
            return (
              <fieldset key={grupo.id}>
                <legend className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-800">{grupo.nombre}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${grupo.obligatorio ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {grupo.obligatorio ? 'Obligatorio' : 'Opcional'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {grupo.maximo <= 1 ? 'Elegí una' : `Hasta ${grupo.maximo}`}
                  </span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {grupo.opciones.filter(o => o.nombre.trim()).map(opcion => {
                    const activa = elegidasGrupo.includes(opcion.id);
                    const lleno = !activa && grupo.maximo > 1 && elegidasGrupo.length >= grupo.maximo;
                    return (
                      <button
                        key={opcion.id}
                        type="button"
                        aria-pressed={activa}
                        disabled={lleno}
                        onClick={() => setSeleccion(s => alternarOpcion(grupo, s, opcion.id))}
                        className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                          activa ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium' : 'border-slate-100 text-slate-700 hover:border-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          {activa && <Check size={14} className="shrink-0" />}
                          <span className="truncate">{opcion.nombre}</span>
                        </span>
                        {opcion.precio_extra > 0 && <span className="text-xs text-slate-500 shrink-0">+{dinero(opcion.precio_extra)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div>
            <label htmlFor="aclaracion-item" className="block text-sm font-semibold text-slate-800 mb-1.5">Aclaración para cocina</label>
            <input
              id="aclaracion-item"
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
              placeholder="Ej: solo mayonesa, sin cebolla, bien cocido"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Así va a salir</p>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{cantidad}x {producto.nombre}</p>
                <DetalleItem opciones={elegidas} observaciones={observaciones.trim()} />
              </div>
              <p className="text-sm font-bold text-slate-800 shrink-0">{dinero(precio * cantidad)}</p>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 space-y-2">
          {faltan.length > 0 && <p className="text-xs text-amber-700">Falta elegir: {faltan.join(', ')}</p>}
          <button
            onClick={confirmar}
            disabled={faltan.length > 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {textoConfirmar} · {dinero(precio * cantidad)}
          </button>
        </div>
      </div>
    </div>
  );
}

const grupoVacio = (): GrupoOpciones => ({
  id: nuevoId('grp'),
  nombre: '',
  obligatorio: true,
  maximo: 1,
  opciones: [{ id: nuevoId('opc'), nombre: '', precio_extra: 0 }, { id: nuevoId('opc'), nombre: '', precio_extra: 0 }],
});

/** En el formulario del producto: los grupos que se van a preguntar al tomar el pedido. */
export function EditorOpciones({ grupos, onChange }: { grupos: GrupoOpciones[]; onChange: (grupos: GrupoOpciones[]) => void }) {
  const cambiarGrupo = (id: string, cambios: Partial<GrupoOpciones>) =>
    onChange(grupos.map(g => (g.id === id ? { ...g, ...cambios } : g)));
  const cambiarOpcion = (grupo: GrupoOpciones, opcionId: string, cambios: Partial<GrupoOpciones['opciones'][number]>) =>
    cambiarGrupo(grupo.id, { opciones: grupo.opciones.map(o => (o.id === opcionId ? { ...o, ...cambios } : o)) });
  const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400';

  return (
    <div className="col-span-2 border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 border-b border-slate-100">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Opciones para elegir</h4>
          <p className="text-xs text-slate-500">Ej: "Bebida" con Café y Té, o "Aderezo" con Mayonesa, Ketchup y Mostaza.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...grupos, grupoVacio()])}
          className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-xl text-xs transition-colors shrink-0"
        >
          <Plus size={14} />
          Agregar grupo
        </button>
      </div>

      {grupos.length === 0 ? (
        <p className="p-5 text-center text-xs text-slate-400">
          Sin opciones, se agrega directo al pedido. Igual pueden escribir una aclaración en cada ítem.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {grupos.map(grupo => (
            <div key={grupo.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={grupo.nombre}
                  onChange={e => cambiarGrupo(grupo.id, { nombre: e.target.value })}
                  placeholder="Nombre del grupo (ej: Bebida)"
                  aria-label="Nombre del grupo"
                  className={`${campo} flex-1 min-w-[10rem] font-semibold`}
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={grupo.obligatorio} onChange={e => cambiarGrupo(grupo.id, { obligatorio: e.target.checked })} />
                  Obligatorio
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  Puede elegir hasta
                  <input
                    type="number"
                    min="1"
                    value={grupo.maximo}
                    onChange={e => cambiarGrupo(grupo.id, { maximo: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={`${campo} w-16 py-1`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onChange(grupos.filter(g => g.id !== grupo.id))}
                  className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Quitar grupo"
                  aria-label="Quitar grupo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-2 pl-1">
                {grupo.opciones.map(opcion => (
                  <div key={opcion.id} className="flex items-center gap-2">
                    <input
                      value={opcion.nombre}
                      onChange={e => cambiarOpcion(grupo, opcion.id, { nombre: e.target.value })}
                      placeholder="Opción (ej: Café)"
                      aria-label="Nombre de la opción"
                      className={`${campo} flex-1`}
                    />
                    <span className="text-xs text-slate-400">+$</span>
                    <input
                      type="number"
                      min="0"
                      value={opcion.precio_extra || ''}
                      onChange={e => cambiarOpcion(grupo, opcion.id, { precio_extra: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      aria-label="Precio extra"
                      className={`${campo} w-24 text-right`}
                    />
                    <button
                      type="button"
                      onClick={() => cambiarGrupo(grupo.id, { opciones: grupo.opciones.filter(o => o.id !== opcion.id) })}
                      className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Quitar opción"
                      aria-label="Quitar opción"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => cambiarGrupo(grupo.id, { opciones: [...grupo.opciones, { id: nuevoId('opc'), nombre: '', precio_extra: 0 }] })}
                  className="text-xs font-medium text-amber-600 hover:underline"
                >
                  + Agregar opción
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
