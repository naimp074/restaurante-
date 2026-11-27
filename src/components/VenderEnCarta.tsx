import { useMemo, useState } from 'react';
import { Link2, Plus, X } from 'lucide-react';
import type { CategoriaProducto, Ingrediente, Producto } from '../lib/types';
import { cantidadPorVenta, crearProductoDesdeInsumo, desunirInsumoDeProducto, productosDelInsumo, unirInsumoAProducto } from '../lib/stockEnCarta';

const pesos = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const normalizar = (valor: string) => valor.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

interface Props {
  insumo: Ingrediente;
  productos: Producto[];
  categorias: CategoriaProducto[];
  onClose: () => void;
  onListo: (mensaje: string) => void;
}

/**
 * "Vender en carta" desde Stock: crea el producto en Cartas, o lo une a uno que ya está, para que cada venta
 * cobrada descuente este insumo. Para lo que se vende tal cual entra: gaseosas, cervezas, vinos, alfajores.
 */
export function VenderEnCarta({ insumo, productos, categorias, onClose, onListo }: Props) {
  const conectados = productosDelInsumo(insumo.id, productos);
  const [modo, setModo] = useState<'nuevo' | 'unir'>('nuevo');
  const [nombre, setNombre] = useState(insumo.nombre);
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id || '');
  const [precio, setPrecio] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [busqueda, setBusqueda] = useState('');
  const [productoId, setProductoId] = useState('');
  const [error, setError] = useState('');

  const nombreCategoria = (id?: string) => categorias.find(c => c.id === id)?.nombre || 'Sin categoría';

  // Para unir: primero los que se parecen al nombre del insumo; los ya conectados no se ofrecen.
  const candidatos = useMemo(() => {
    const conectadosIds = new Set(conectados.map(p => p.id));
    const clave = normalizar(insumo.nombre);
    const texto = normalizar(busqueda);
    return productos
      .filter(p => p.activo && !conectadosIds.has(p.id))
      .filter(p => !texto || normalizar(p.nombre).includes(texto))
      .map(p => {
        const n = normalizar(p.nombre);
        const parecido = n === clave ? 3 : n.includes(clave) || clave.includes(n) ? 2 : clave.split(' ').some(palabra => palabra.length > 2 && n.includes(palabra)) ? 1 : 0;
        return { producto: p, parecido };
      })
      .sort((a, b) => b.parecido - a.parecido || a.producto.nombre.localeCompare(b.producto.nombre))
      .slice(0, 30);
  }, [productos, conectados, insumo.nombre, busqueda]);

  const guardar = () => {
    setError('');
    try {
      const porVenta = Number(cantidad);
      if (modo === 'nuevo') {
        const producto = crearProductoDesdeInsumo({ insumo, nombre, categoria_id: categoriaId, precio: Number(precio), cantidad: porVenta });
        onListo(`"${producto.nombre}" ya está en la carta (${nombreCategoria(producto.categoria_id)}) y cada venta descuenta ${porVenta} ${insumo.unidad_medida} de ${insumo.nombre}.`);
      } else {
        if (!productoId) throw new Error('Elegí el producto de la carta.');
        const producto = unirInsumoAProducto({ insumo, productoId, cantidad: porVenta });
        onListo(`Listo: cada venta de "${producto.nombre}" descuenta ${porVenta} ${insumo.unidad_medida} de ${insumo.nombre}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  };

  const quitar = (producto: Producto) => {
    desunirInsumoDeProducto(insumo.id, producto.id);
    onListo(`"${producto.nombre}" sigue en la carta, pero ya no descuenta ${insumo.nombre}.`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Vender en carta</h3>
            <p className="text-sm text-slate-500">
              {insumo.nombre}: aparece en las comandas y cada venta cobrada descuenta del stock. Se puede vender aunque el stock esté en cero.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {conectados.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ya está en la carta</p>
              {conectados.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {nombreCategoria(p.categoria_id)} · {pesos(p.precio_venta)} · descuenta {cantidadPorVenta(p, insumo.id)} {insumo.unidad_medida}
                    </p>
                  </div>
                  <button type="button" onClick={() => quitar(p)} className="text-xs font-medium text-slate-500 hover:text-red-600 shrink-0">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setModo('nuevo'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border ${modo === 'nuevo' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'}`}
            >
              <Plus size={14} /> Producto nuevo
            </button>
            <button
              type="button"
              onClick={() => { setModo('unir'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border ${modo === 'unir' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'}`}
            >
              <Link2 size={14} /> Unir a uno que ya está
            </button>
          </div>

          {modo === 'nuevo' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre en la carta</label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="Ej: Coca-Cola 500 cc"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoría</label>
                <select
                  value={categoriaId}
                  onChange={e => setCategoriaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-amber-400"
                >
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Precio de venta</label>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={precio}
                    onChange={e => setPrecio(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descuenta por venta</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                  />
                  <p className="text-xs text-slate-400 mt-1">{insumo.unidad_medida}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Producto de la carta</label>
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar en la carta..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 mb-2"
                />
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                  {candidatos.map(({ producto }) => (
                    <button
                      type="button"
                      key={producto.id}
                      onClick={() => setProductoId(producto.id)}
                      className={`w-full text-left px-3 py-2 text-sm ${productoId === producto.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                    >
                      <span className="font-medium text-slate-800">{producto.nombre}</span>
                      <span className="block text-xs text-slate-500">
                        {nombreCategoria(producto.categoria_id)} · {pesos(producto.precio_venta)}
                        {(producto.receta || []).length > 0 ? ' · ya tiene receta' : ''}
                      </span>
                    </button>
                  ))}
                  {candidatos.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 text-center">No encontré productos con ese nombre.</p>}
                </div>
              </div>
              <div className="w-40">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descuenta por venta</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                />
                <p className="text-xs text-slate-400 mt-1">{insumo.unidad_medida}</p>
              </div>
              <p className="text-xs text-slate-500">El precio y el resto del producto no cambian: solo empieza a descontar {insumo.nombre}.</p>
            </>
          )}

          {error && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-700">{error}</div>}
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cerrar
          </button>
          <button onClick={guardar} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400">
            {modo === 'nuevo' ? 'Agregar a la carta' : 'Unir'}
          </button>
        </div>
      </div>
    </div>
  );
}
