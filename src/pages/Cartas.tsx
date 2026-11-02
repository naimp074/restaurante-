import { useState } from 'react';
import { Check, CreditCard as Edit2, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import type { CategoriaProducto, Producto } from '../lib/types';
import { agregarCartaRestaurante, cartaRestauranteCargada } from '../lib/cartaRestaurante';
import { loadCategorias, saveCategorias, useCategorias } from '../lib/categoriasStore';
import { margenPorcentaje } from '../lib/costosReceta';
import { nuevoId } from '../lib/ids';
import { categoriasIniciales } from '../lib/mockData';
import { loadProductos, saveProductos, useProductos } from '../lib/productosStore';
import { pasarATresCategorias, tieneCategoriasViejas } from '../lib/reorganizarCategorias';
import { withStoreTransaction } from '../lib/storeSync';

type FormularioProducto = {
  id: string | null;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria_id: string;
  precio: string;
  costo: string;
  tiempo: string;
  imagen_url: string;
  disponible: boolean;
  agotado: boolean;
};

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white';
const etiqueta = 'block text-sm font-medium text-slate-700 mb-1.5';
const dinero = (n: number) => `$${n.toLocaleString('es-AR')}`;

const formularioDe = (producto: Producto | null, categoriaId: string): FormularioProducto => ({
  id: producto?.id ?? null,
  codigo: producto?.codigo ?? '',
  nombre: producto?.nombre ?? '',
  descripcion: producto?.descripcion ?? '',
  categoria_id: producto?.categoria_id ?? categoriaId,
  precio: producto ? String(producto.precio_venta) : '',
  costo: producto ? String(producto.costo_produccion) : '0',
  tiempo: String(producto?.tiempo_preparacion ?? 10),
  imagen_url: producto?.imagen_url ?? '',
  disponible: producto?.disponible ?? true,
  agotado: producto?.agotado ?? false,
});

/** Lo que se vende: categorías y productos. Las recetas se siguen editando en Combos. */
export default function Cartas() {
  const categorias = useCategorias();
  const productos = useProductos();
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [formulario, setFormulario] = useState<FormularioProducto | null>(null);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [categoriaEditada, setCategoriaEditada] = useState<{ id: string | null; nombre: string } | null>(null);
  const [errorCategoria, setErrorCategoria] = useState('');

  const ordenadas = [...categorias].sort((a, b) => a.orden - b.orden);
  const texto = busqueda.trim().toLowerCase();
  const visibles = productos
    .filter(p => filtro === 'todas' || (filtro === 'sin' ? !categorias.some(c => c.id === p.categoria_id) : p.categoria_id === filtro))
    .filter(p => `${p.codigo || ''} ${p.nombre}`.toLowerCase().includes(texto))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const sinCategoria = productos.filter(p => !categorias.some(c => c.id === p.categoria_id)).length;
  const productoEditado = formulario?.id ? productos.find(p => p.id === formulario.id) : undefined;
  const tieneReceta = Boolean(productoEditado?.receta?.length);

  const reorganizar = () => {
    if (!window.confirm('Esto deja solo S-CAFETERÍA, S-BAR y S-RESTAURANTE, y pasa toda la carta a S-CAFETERÍA en todos los dispositivos. No cambia precios ni ventas. ¿Confirmar?')) return;
    withStoreTransaction(() => {
      saveCategorias(categoriasIniciales);
      saveProductos(pasarATresCategorias(loadProductos()));
    });
    setFiltro('todas');
  };

  const categoriaFiltrada = categorias.find(c => c.id === filtro);
  const cafeteria = categorias.find(c => c.id === 's-cafeteria');
  const enLaCategoria = productos.filter(p => p.categoria_id === filtro).length;

  const pasarACafeteria = () => {
    if (!categoriaFiltrada || !cafeteria) return;
    if (!window.confirm(`¿Pasar los ${enLaCategoria} productos de ${categoriaFiltrada.nombre} a ${cafeteria.nombre} en todos los dispositivos? No cambian precios ni ventas.`)) return;
    const ahora = new Date().toISOString();
    saveProductos(loadProductos().map(p => (p.categoria_id === categoriaFiltrada.id
      ? { ...p, categoria_id: cafeteria.id, categoria: cafeteria, updated_at: ahora }
      : p)));
    setFiltro(cafeteria.id);
  };

  const cargarCartaRestaurante = () => {
    if (!window.confirm('Esto agrega los 192 productos de la carta del restaurante a S-RESTAURANTE en todos los dispositivos. No cambia lo que ya está cargado. ¿Confirmar?')) return;
    saveProductos(agregarCartaRestaurante(loadProductos()));
    setFiltro('s-restaurante');
  };

  const guardarCategoria = () => {
    if (!categoriaEditada) return;
    const nombre = categoriaEditada.nombre.trim();
    if (!nombre) return setErrorCategoria('Escribí el nombre de la categoría.');
    const actuales = loadCategorias();
    const repetida = actuales.some(c => c.id !== categoriaEditada.id && c.nombre.toLowerCase() === nombre.toLowerCase());
    if (repetida) return setErrorCategoria('Ya hay una categoría con ese nombre.');

    if (categoriaEditada.id) {
      saveCategorias(actuales.map(c => (c.id === categoriaEditada.id ? { ...c, nombre, descripcion: nombre } : c)));
      saveProductos(loadProductos().map(p => (p.categoria_id === categoriaEditada.id && p.categoria
        ? { ...p, categoria: { ...p.categoria, nombre, descripcion: nombre } }
        : p)));
    } else {
      const nueva: CategoriaProducto = {
        id: nuevoId('cat'),
        nombre,
        descripcion: nombre,
        icono: 'package',
        color: '#f59e0b',
        orden: Math.max(0, ...actuales.map(c => c.orden)) + 1,
        activa: true,
        created_at: new Date().toISOString(),
      };
      saveCategorias([...actuales, nueva]);
    }
    setErrorCategoria('');
    setCategoriaEditada(null);
  };

  const borrarCategoria = (categoria: CategoriaProducto) => {
    const cantidad = productos.filter(p => p.categoria_id === categoria.id).length;
    if (cantidad) {
      setErrorCategoria(`"${categoria.nombre}" tiene ${cantidad} producto${cantidad === 1 ? '' : 's'}: pasalos a otra categoría antes de borrarla.`);
      return;
    }
    if (!window.confirm(`¿Borrar la categoría "${categoria.nombre}"?`)) return;
    setErrorCategoria('');
    saveCategorias(loadCategorias().filter(c => c.id !== categoria.id));
    if (filtro === categoria.id) setFiltro('todas');
  };

  const guardarProducto = () => {
    if (!formulario) return;
    const nombre = formulario.nombre.trim();
    const precio = Number(formulario.precio);
    const costo = Number(formulario.costo);
    const tiempo = Number(formulario.tiempo);
    if (!nombre) return setErrorFormulario('Escribí el nombre del producto.');
    if (!Number.isFinite(precio) || precio < 0 || !Number.isFinite(costo) || costo < 0) return setErrorFormulario('Revisá el precio y el costo.');
    if (formulario.disponible && precio === 0) return setErrorFormulario('Cargá el precio, o desmarcá "A la venta".');
    if (!Number.isFinite(tiempo) || tiempo < 0) return setErrorFormulario('Revisá el tiempo de preparación.');

    const ahora = new Date().toISOString();
    const actuales = loadProductos();
    const previo = actuales.find(p => p.id === formulario.id);
    const costoFinal = previo?.receta?.length ? previo.costo_produccion : costo;
    const datos = {
      nombre,
      codigo: formulario.codigo.trim() || previo?.codigo || `PROD-${Date.now().toString().slice(-6)}`,
      descripcion: formulario.descripcion.trim(),
      categoria_id: formulario.categoria_id || undefined,
      categoria: categorias.find(c => c.id === formulario.categoria_id),
      precio_venta: precio,
      costo_produccion: costoFinal,
      margen_ganancia: margenPorcentaje(precio, costoFinal),
      tiempo_preparacion: tiempo,
      imagen_url: formulario.imagen_url.trim() || undefined,
      disponible: formulario.disponible,
      agotado: formulario.agotado,
      updated_at: ahora,
    };
    saveProductos(previo
      ? actuales.map(p => (p.id === previo.id ? { ...p, ...datos } : p))
      : [{ ...datos, id: nuevoId('prod'), activo: true, created_at: ahora, receta: [] }, ...actuales]);
    setFormulario(null);
  };

  const borrarProducto = (producto: Producto) => {
    if (!window.confirm(`¿Borrar "${producto.nombre}" en todos los dispositivos? Las ventas ya hechas no cambian.`)) return;
    saveProductos(loadProductos().filter(p => p.id !== producto.id));
    setFormulario(null);
  };

  const abrirNuevo = () => {
    setErrorFormulario('');
    setFormulario(formularioDe(null, categorias.some(c => c.id === filtro) ? filtro : ''));
  };

  const botonFiltro = (activo: boolean) => `shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
    activo ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Cartas</h2>
          <p className="text-sm text-slate-500">Lo que se vende: {productos.length} productos en {categorias.length} categorías.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tieneCategoriasViejas(productos) && (
            <button
              onClick={reorganizar}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              Pasar a las 3 categorías
            </button>
          )}
          {!cartaRestauranteCargada(productos) && (
            <button
              onClick={cargarCartaRestaurante}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              Cargar carta del restaurante
            </button>
          )}
          <button
            onClick={() => { setErrorCategoria(''); setCategoriaEditada({ id: null, nombre: '' }); }}
            className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors"
          >
            <Tags size={16} />
            Nueva categoría
          </button>
          <button
            onClick={abrirNuevo}
            className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors"
          >
            <Plus size={16} />
            Agregar producto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-5 items-start">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <h3 className="font-semibold text-slate-800 p-4 border-b border-slate-100">Categorías</h3>
          {errorCategoria && !categoriaEditada && <p role="alert" className="m-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorCategoria}</p>}
          <div className="divide-y divide-slate-50">
            {ordenadas.map(categoria => (
              <div key={categoria.id} className="flex items-center gap-1 px-3 py-2">
                <button
                  onClick={() => setFiltro(categoria.id)}
                  className={`flex-1 min-w-0 text-left text-sm truncate ${filtro === categoria.id ? 'font-semibold text-amber-700' : 'text-slate-700'}`}
                >
                  {categoria.nombre} <span className="text-xs text-slate-400">({productos.filter(p => p.categoria_id === categoria.id).length})</span>
                </button>
                <button
                  onClick={() => { setErrorCategoria(''); setCategoriaEditada({ id: categoria.id, nombre: categoria.nombre }); }}
                  aria-label={`Editar ${categoria.nombre}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => borrarCategoria(categoria)}
                  aria-label={`Borrar ${categoria.nombre}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!ordenadas.length && <p className="p-4 text-sm text-slate-500">Todavía no hay categorías.</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden min-w-0">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código..."
                aria-label="Buscar producto"
                className={`${campo} pl-9`}
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button onClick={() => setFiltro('todas')} className={botonFiltro(filtro === 'todas')}>Todas</button>
              {ordenadas.map(c => <button key={c.id} onClick={() => setFiltro(c.id)} className={botonFiltro(filtro === c.id)}>{c.nombre}</button>)}
              {sinCategoria > 0 && <button onClick={() => setFiltro('sin')} className={botonFiltro(filtro === 'sin')}>Sin categoría ({sinCategoria})</button>}
            </div>
            {categoriaFiltrada && cafeteria && categoriaFiltrada.id !== cafeteria.id && enLaCategoria > 0 && (
              <button
                onClick={pasarACafeteria}
                className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
              >
                Pasar estos {enLaCategoria} productos a {cafeteria.nombre}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {visibles.map(producto => (
              <button
                key={producto.id}
                onClick={() => { setErrorFormulario(''); setFormulario(formularioDe(producto, '')); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{producto.nombre}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {categorias.find(c => c.id === producto.categoria_id)?.nombre || 'Sin categoría'}
                    {producto.descripcion ? ` · ${producto.descripcion}` : ''}
                  </p>
                </div>
                {!producto.disponible && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">No se vende</span>}
                {producto.agotado && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Agotado</span>}
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{producto.precio_venta ? dinero(producto.precio_venta) : 'Sin precio'}</span>
                <Edit2 size={14} className="text-slate-400 shrink-0" />
              </button>
            ))}
            {!visibles.length && (
              <p className="p-10 text-center text-sm text-slate-500">
                {productos.length ? 'No hay productos con ese filtro.' : 'Todavía no cargaste productos. Tocá "Agregar producto".'}
              </p>
            )}
          </div>
        </div>
      </div>

      {categoriaEditada && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{categoriaEditada.id ? 'Editar categoría' : 'Nueva categoría'}</h3>
              <button onClick={() => setCategoriaEditada(null)} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <label htmlFor="categoria-nombre" className={etiqueta}>Nombre</label>
              <input
                id="categoria-nombre"
                autoFocus
                value={categoriaEditada.nombre}
                onChange={e => setCategoriaEditada({ ...categoriaEditada, nombre: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') guardarCategoria(); }}
                className={campo}
              />
              {errorCategoria && <p role="alert" className="text-sm text-red-600">{errorCategoria}</p>}
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setCategoriaEditada(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={guardarCategoria} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                <Check size={16} />Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {formulario && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{formulario.id ? 'Editar producto' : 'Agregar producto'}</h3>
              <button onClick={() => setFormulario(null)} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="producto-nombre" className={etiqueta}>Nombre *</label>
                <input id="producto-nombre" value={formulario.nombre} onChange={e => setFormulario({ ...formulario, nombre: e.target.value })} className={campo} />
              </div>
              <div>
                <label htmlFor="producto-descripcion" className={etiqueta}>Descripción</label>
                <textarea id="producto-descripcion" rows={2} value={formulario.descripcion} onChange={e => setFormulario({ ...formulario, descripcion: e.target.value })} className={campo} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="producto-categoria" className={etiqueta}>Categoría</label>
                  <select id="producto-categoria" value={formulario.categoria_id} onChange={e => setFormulario({ ...formulario, categoria_id: e.target.value })} className={campo}>
                    <option value="">Sin categoría</option>
                    {ordenadas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="producto-codigo" className={etiqueta}>Código</label>
                  <input id="producto-codigo" value={formulario.codigo} onChange={e => setFormulario({ ...formulario, codigo: e.target.value })} placeholder="Se genera solo" className={campo} />
                </div>
                <div>
                  <label htmlFor="producto-precio" className={etiqueta}>Precio de venta</label>
                  <input id="producto-precio" type="number" min="0" step="any" value={formulario.precio} onChange={e => setFormulario({ ...formulario, precio: e.target.value })} className={campo} />
                </div>
                <div>
                  <label htmlFor="producto-costo" className={etiqueta}>Costo</label>
                  <input id="producto-costo" type="number" min="0" step="any" disabled={tieneReceta} value={tieneReceta ? String(productoEditado?.costo_produccion ?? 0) : formulario.costo} onChange={e => setFormulario({ ...formulario, costo: e.target.value })} className={`${campo} disabled:bg-slate-50`} />
                  {tieneReceta && <p className="text-xs text-slate-500 mt-1">Sale de la receta: se edita en Combos.</p>}
                </div>
                <div>
                  <label htmlFor="producto-tiempo" className={etiqueta}>Preparación (min)</label>
                  <input id="producto-tiempo" type="number" min="0" value={formulario.tiempo} onChange={e => setFormulario({ ...formulario, tiempo: e.target.value })} className={campo} />
                </div>
                <div>
                  <label htmlFor="producto-imagen" className={etiqueta}>Enlace de la imagen</label>
                  <input id="producto-imagen" type="url" value={formulario.imagen_url} onChange={e => setFormulario({ ...formulario, imagen_url: e.target.value })} placeholder="https://..." className={campo} />
                </div>
              </div>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={formulario.disponible} onChange={e => setFormulario({ ...formulario, disponible: e.target.checked })} className="accent-amber-500" />
                  A la venta
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={formulario.agotado} onChange={e => setFormulario({ ...formulario, agotado: e.target.checked })} className="accent-amber-500" />
                  Agotado
                </label>
              </div>
              {errorFormulario && <p role="alert" className="text-sm text-red-600">{errorFormulario}</p>}
            </div>
            <div className="flex flex-wrap gap-3 p-5 border-t border-slate-100">
              {productoEditado && (
                <button onClick={() => borrarProducto(productoEditado)} className="px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium flex items-center gap-2">
                  <Trash2 size={15} />Borrar
                </button>
              )}
              <button onClick={() => setFormulario(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={guardarProducto} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                <Check size={16} />Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
