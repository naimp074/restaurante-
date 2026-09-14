import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Plus, CreditCard as Edit2, Eye, EyeOff, Search, X, Check, AlertTriangle, Grid3X3, List, MoreHorizontal, Download, Upload, BadgePercent } from 'lucide-react';
import type { Ingrediente, ListaPrecio, MetodoListaPrecio, Producto, RecetaItem, TipoComponenteReceta, UnidadMedida } from '../lib/types';
import { categoriasIniciales } from '../lib/mockData';
import { loadProductos, saveProductos } from '../lib/productosStore';
import { calcularCostoProducto, costoUnitarioProduccion, productosSinDescuento, sugerirInsumoPara } from '../lib/costosReceta';
import BuscadorInsumo from '../components/BuscadorInsumo';
import { loadDemoProducciones, saveDemoIngredientes, useIngredientes, useProducciones } from '../lib/demoStore';
import { dayKey } from '../lib/fechas';
import { getDescuentoProducto, loadListasPrecios, metodosListasPrecio, saveListasPrecios } from '../lib/listasPreciosStore';

const unidades: UnidadMedida[] = ['gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete'];

const getRecetaItemTipo = (item: RecetaItem): TipoComponenteReceta => item.tipo || 'stock';

const getRecetaItemData = (item: RecetaItem, catalogo: Ingrediente[] = []) => {
  if (getRecetaItemTipo(item) === 'produccion') {
    const produccion = item.produccion || loadDemoProducciones().find(p => p.id === item.produccion_id);
    return {
      codigo: produccion?.id || '',
      nombre: produccion?.nombre || 'Producción',
      unidad: produccion?.unidad_medida || item.unidad_medida,
      costoUnitario: produccion
        ? costoUnitarioProduccion(produccion, id => catalogo.find(i => i.id === id)?.costo_por_unidad || 0)
        : 0,
      stockActual: produccion?.stock_actual || 0,
      stockLabel: 'Stock producido',
      produccion,
    };
  }

  const ingrediente = item.ingrediente || catalogo.find(i => i.id === item.ingrediente_id);
  return {
    codigo: ingrediente?.codigo || item.ingrediente_id || '',
    nombre: ingrediente?.nombre || 'Insumo',
    unidad: ingrediente?.unidad_medida || item.unidad_medida,
    costoUnitario: ingrediente?.costo_por_unidad || 0,
    stockActual: ingrediente?.stock_actual || 0,
    stockLabel: 'Stock actual',
    ingrediente,
  };
};

const calcularCostoReceta = (receta: RecetaItem[] = [], catalogo: Ingrediente[] = []) =>
  calcularCostoProducto(
    { receta } as Producto,
    id => catalogo.find(i => i.id === id)?.costo_por_unidad || 0,
    loadDemoProducciones(),
  );

interface ComboImportDraft {
  key: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria_id?: string;
  precio_venta: number;
  costo_total?: number;
  tiempo_preparacion: number;
  receta: RecetaItem[];
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanArticuloNombre = (value: string) =>
  value
    .replace(/^(stock|produccion|producción)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const mapUnidadExcel = (value: unknown): UnidadMedida => {
  const raw = normalizeText(String(value ?? ''));
  if (!raw || raw === 'u' || raw === 'un' || raw === 'unidad' || raw === 'unidades') return 'unidad';
  if (raw === 'g' || raw === 'gr' || raw === 'gramo' || raw === 'gramos') return 'gramos';
  if (raw === 'kg' || raw === 'kilo' || raw === 'kilos') return 'kilos';
  if (raw === 'ml' || raw === 'mililitro' || raw === 'mililitros') return 'mililitros';
  if (raw === 'l' || raw === 'lt' || raw === 'litro' || raw === 'litros') return 'litros';
  if (raw === 'feta') return 'feta';
  if (raw === 'porcion' || raw === 'porción') return 'porcion';
  if (raw === 'paquete' || raw === 'paq') return 'paquete';
  return 'unidad';
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(,|$))/g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRowValue = (row: Record<string, unknown>, aliases: string[]) => {
  const wanted = aliases.map(normalizeText);
  const key = Object.keys(row).find(header => wanted.includes(normalizeText(header)));
  return key ? row[key] : undefined;
};

const findCategoriaByName = (value: unknown) => {
  const normalized = normalizeText(String(value ?? ''));
  if (!normalized) return undefined;
  return categoriasIniciales.find(cat => normalizeText(cat.nombre) === normalized || normalizeText(cat.nombre).includes(normalized));
};

const findIngredienteEnCatalogo = (catalogo: Ingrediente[], codigo?: string, nombre?: string) => {
  const codigoNorm = normalizeText(codigo || '');
  if (codigoNorm) {
    const byCodigo = catalogo.find(item => normalizeText(item.codigo || item.id) === codigoNorm);
    if (byCodigo) return byCodigo;
  }

  const nombreNorm = normalizeText(cleanArticuloNombre(nombre || ''));
  if (!nombreNorm) return undefined;
  return catalogo.find(item => {
    const itemName = normalizeText(item.nombre);
    return itemName === nombreNorm || itemName.includes(nombreNorm) || nombreNorm.includes(itemName);
  });
};

const findProduccionByName = (value: unknown) => {
  const normalized = normalizeText(cleanArticuloNombre(String(value ?? '')));
  return loadDemoProducciones().find(item => normalizeText(item.nombre) === normalized || normalizeText(item.nombre).includes(normalized));
};

const pickBestSheet = (workbook: XLSX.WorkBook) => {
  let bestName = workbook.SheetNames[0];
  let bestCount = -1;
  workbook.SheetNames.forEach(name => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
    if (rows.length > bestCount) {
      bestCount = rows.length;
      bestName = name;
    }
  });
  return workbook.Sheets[bestName];
};

interface ProductosProps {
  apartadoInicial?: 'combos' | 'precios' | 'listas';
}

export default function Productos({ apartadoInicial }: ProductosProps) {
  const [productos, setProductos] = useState<Producto[]>(loadProductos);
  const insumosCatalogo = useIngredientes();
  useProducciones();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'catalogo' | 'precios' | 'listas' | 'planilla'>(
    apartadoInicial === 'precios' ? 'precios' : apartadoInicial === 'listas' ? 'listas' : 'catalogo'
  );
  const [apartado, setApartado] = useState<'combos' | 'precios' | 'listas' | null>(apartadoInicial || null);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Producto>>({});
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>(loadListasPrecios);
  const [metodoLista, setMetodoLista] = useState<MetodoListaPrecio>('efectivo');
  const [margenMasivo, setMargenMasivo] = useState('');
  const [productosPrecioSeleccionados, setProductosPrecioSeleccionados] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importDrafts, setImportDrafts] = useState<ComboImportDraft[]>([]);
  const [importError, setImportError] = useState('');
  const [importInsumos, setImportInsumos] = useState<Ingrediente[]>([]);
  const [detalleCombo, setDetalleCombo] = useState<Producto | null>(null);
  const [showVinculacionStock, setShowVinculacionStock] = useState(false);
  const [vinculos, setVinculos] = useState<Record<string, { ingredienteId?: string; cantidad: string }>>({});

  const createRecetaItem = (productoId: string, ingredienteId?: string): RecetaItem => {
    const ingrediente = insumosCatalogo.find(i => i.id === ingredienteId) || insumosCatalogo[0];
    const cantidad = 1;

    return {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      producto_id: productoId,
      tipo: 'stock',
      ingrediente_id: ingrediente?.id,
      cantidad,
      unidad_medida: ingrediente?.unidad_medida || 'unidad',
      costo_calculado: cantidad * (ingrediente?.costo_por_unidad || 0),
      created_at: new Date().toISOString(),
      ingrediente,
    };
  };

  const sinDescuento = productosSinDescuento(productos);

  const filtered = productos.filter(p => {
    const matchCat = categoriaFiltro === 'todos' || p.categoria_id === categoriaFiltro;
    const matchSearch = `${p.codigo || ''} ${p.nombre}`.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchSearch;
  });
  const listaActual = listasPrecios.find(lista => lista.metodo_pago === metodoLista) || listasPrecios[0];
  const todosPreciosVisiblesSeleccionados = filtered.length > 0
    && filtered.every(producto => productosPrecioSeleccionados.includes(producto.id));

  const toggleDisponible = (id: string) => {
    setProductos(prev => prev.map(p =>
      p.id === id ? { ...p, disponible: !p.disponible } : p
    ));
  };

  const toggleAgotado = (id: string) => {
    setProductos(prev => prev.map(p =>
      p.id === id ? { ...p, agotado: !p.agotado } : p
    ));
  };

  const openEdit = (producto: Producto) => {
    setEditForm(producto);
    setSelectedProducto(producto);
    setShowForm(true);
  };

  const abrirVinculacionStock = () => {
    setVinculos(Object.fromEntries(sinDescuento.map(producto => [
      producto.id,
      { ingredienteId: sugerirInsumoPara(producto, insumosCatalogo)?.id, cantidad: '1' },
    ])));
    setShowVinculacionStock(true);
  };

  /** Deja el producto con una receta de un solo insumo: al vender 1, se descuenta esa cantidad. */
  const vincularConInsumo = (producto: Producto) => {
    const vinculo = vinculos[producto.id];
    const ingrediente = insumosCatalogo.find(item => item.id === vinculo?.ingredienteId);
    const cantidad = parseFloat(vinculo?.cantidad || '') || 0;
    if (!ingrediente || cantidad <= 0) return;

    const ahora = new Date().toISOString();
    const costo = cantidad * ingrediente.costo_por_unidad;
    const receta: RecetaItem[] = [{
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      producto_id: producto.id,
      tipo: 'stock',
      ingrediente_id: ingrediente.id,
      cantidad,
      unidad_medida: ingrediente.unidad_medida,
      costo_calculado: costo,
      created_at: ahora,
      ingrediente,
    }];

    setProductos(prev => prev.map(item => item.id === producto.id
      ? {
          ...item,
          receta,
          costo_produccion: costo,
          margen_ganancia: item.precio_venta > 0 ? ((item.precio_venta - costo) / item.precio_venta) * 100 : 0,
          updated_at: ahora,
        }
      : item));
  };

  const openNew = () => {
    setEditForm({
      codigo: '', nombre: '', descripcion: '', precio_venta: 0, costo_produccion: 0,
      tiempo_preparacion: 10, disponible: true, agotado: false, activo: true,
      receta: [],
    });
    setSelectedProducto(null);
    setShowForm(true);
  };

  const saveProducto = () => {
    if (!editForm.nombre) return;
    const receta = editForm.receta || [];
    const costoReceta = calcularCostoReceta(receta, insumosCatalogo);
    const costoProduccion = receta.length > 0 ? costoReceta : editForm.costo_produccion || 0;
    const precioVenta = editForm.precio_venta || 0;
    const margenGanancia = precioVenta > 0
      ? ((precioVenta - costoProduccion) / precioVenta) * 100
      : 0;
    const categoria = categoriasIniciales.find(c => c.id === editForm.categoria_id);

    if (selectedProducto) {
      setProductos(prev => prev.map(p => p.id === selectedProducto.id ? {
        ...p,
        ...editForm,
        costo_produccion: costoProduccion,
        margen_ganancia: margenGanancia,
        categoria,
        receta,
        updated_at: new Date().toISOString(),
      } as Producto : p));
    } else {
      const newId = `prod-${Date.now()}`;
      const newProd: Producto = {
        id: newId,
        codigo: editForm.codigo?.trim() || `COMBO-${Date.now().toString().slice(-5)}`,
        nombre: editForm.nombre || '',
        descripcion: editForm.descripcion || '',
        categoria_id: editForm.categoria_id,
        precio_venta: precioVenta,
        costo_produccion: costoProduccion,
        margen_ganancia: margenGanancia,
        disponible: true, agotado: false, activo: true,
        tiempo_preparacion: editForm.tiempo_preparacion || 10,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        categoria,
        receta: receta.map(item => ({ ...item, producto_id: newId })),
      };
      setProductos(prev => [newProd, ...prev]);
    }
    setShowForm(false);
  };

  const procesarPlanillaCombos = async (file: File) => {
    setImportError('');
    setImportInsumos([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = pickBestSheet(workbook);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const grouped = new Map<string, ComboImportDraft>();
      const insumosNuevos = new Map<string, Ingrediente>();
      let workingCatalog = [...insumosCatalogo];

      const ensureArticulo = (codigoRaw: string, nombreRaw: string, costoUnitario: number, unidad: UnidadMedida) => {
        const codigo = codigoRaw.trim();
        const nombreLimpio = cleanArticuloNombre(nombreRaw) || codigo || 'Artículo';
        const existente = findIngredienteEnCatalogo(workingCatalog, codigo, nombreLimpio);
        if (existente) {
          const actualizado: Ingrediente = {
            ...existente,
            codigo: existente.codigo || codigo || existente.codigo,
            costo_por_unidad: costoUnitario > 0 ? costoUnitario : existente.costo_por_unidad,
            unidad_medida: unidad || existente.unidad_medida,
            updated_at: new Date().toISOString(),
          };
          workingCatalog = workingCatalog.map(item => item.id === existente.id ? actualizado : item);
          insumosNuevos.set(actualizado.id, actualizado);
          return actualizado;
        }

        const nuevo: Ingrediente = {
          id: `ing-import-${codigo || normalizeText(nombreLimpio).replace(/\s+/g, '-') || Date.now()}`,
          codigo: codigo || undefined,
          nombre: nombreLimpio,
          unidad_medida: unidad,
          stock_actual: 0,
          stock_minimo: 0,
          costo_por_unidad: costoUnitario,
          activo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        workingCatalog = [...workingCatalog, nuevo];
        insumosNuevos.set(nuevo.id, nuevo);
        return nuevo;
      };

      rows.forEach((row, rowIndex) => {
        const nombre = String(getRowValue(row, [
          'descripcion combo',
          'descripción combo',
          'producto para la venta',
          'combo',
          'nombre',
          'producto',
          'producto final',
        ]) || '').trim();
        const codigo = String(getRowValue(row, [
          'codigo combo',
          'código combo',
          'codigo',
          'código',
          'sku',
          'cod',
        ]) || '').trim();

        if (!nombre && !codigo) return;

        const key = nombre ? `nom:${normalizeText(nombre)}` : `cod:${normalizeText(codigo)}`;
        const categoria = findCategoriaByName(getRowValue(row, ['categoria', 'categoría', 'rubro']));
        const precio = parseNumber(getRowValue(row, ['precio', 'precio venta', 'precio_venta', 'venta']));
        const costoTotal = parseNumber(getRowValue(row, ['costo total', 'costo combo', 'costo']));
        const tiempo = parseNumber(getRowValue(row, ['tiempo', 'tiempo preparacion', 'minutos']));
        const descripcion = String(getRowValue(row, ['descripcion', 'descripción', 'detalle']) || '').trim();
        const existing = grouped.get(key);
        const draft: ComboImportDraft = existing || {
          key,
          codigo,
          nombre: nombre || codigo,
          descripcion: descripcion && normalizeText(descripcion) !== normalizeText(nombre) ? descripcion : '',
          categoria_id: categoria?.id || 'cat-5',
          precio_venta: precio,
          costo_total: costoTotal || undefined,
          tiempo_preparacion: tiempo || 10,
          receta: [],
        };

        if (!draft.nombre && nombre) draft.nombre = nombre;
        if (!draft.codigo && codigo) draft.codigo = codigo;
        if (!draft.precio_venta && precio) draft.precio_venta = precio;
        if ((!draft.costo_total || draft.costo_total <= 0) && costoTotal > 0) draft.costo_total = costoTotal;
        if (!draft.categoria_id && categoria?.id) draft.categoria_id = categoria.id;

        const articuloNombre = String(getRowValue(row, [
          'descripcion articulo',
          'descripción artículo',
          'descripcion artículo',
          'descripción articulo',
          'componente',
          'insumo',
          'ingrediente',
          'produccion',
          'producción',
          'item receta',
          'articulo',
          'artículo',
        ]) || '').trim();
        const articuloCodigo = String(getRowValue(row, [
          'codigo articulo',
          'código artículo',
          'codigo artículo',
          'código articulo',
          'cod articulo',
          'sku articulo',
        ]) || '').trim();

        if (articuloNombre || articuloCodigo) {
          const origenText = normalizeText(String(getRowValue(row, ['origen', 'tipo', 'fuente']) || articuloNombre || ''));
          const esProduccion = origenText.includes('produ') && !origenText.includes('stock');
          const produccion = esProduccion ? findProduccionByName(articuloNombre) : undefined;
          const cantidad = parseNumber(getRowValue(row, [
            'cantidad en combo',
            'cantidad',
            'cant',
            'qty',
          ])) || 1;
          const unidad = mapUnidadExcel(getRowValue(row, ['unidad', 'unidad medida', 'unidad_medida']));
          const costoUnitario = parseNumber(getRowValue(row, [
            'costo unitario articulo',
            'costo unitario artículo',
            'costo unitario',
            'costo_unitario',
            'costo',
          ]));
          const incidencia = parseNumber(getRowValue(row, [
            'incidencia sobre el costo del combo',
            'incidencia en el producto para venta',
            'incidencia',
          ]));

          const nuevaLinea: RecetaItem = produccion
            ? {
                id: `import-rec-${rowIndex}-${Date.now()}`,
                producto_id: 'import',
                tipo: 'produccion',
                produccion_id: produccion.id,
                cantidad,
                unidad_medida: unidad || produccion.unidad_medida,
                costo_calculado: incidencia || cantidad * (produccion.costo_unitario || costoUnitario),
                created_at: new Date().toISOString(),
                produccion,
              }
            : (() => {
                const ingrediente = ensureArticulo(articuloCodigo, articuloNombre, costoUnitario, unidad);
                return {
                  id: `import-rec-${rowIndex}-${Date.now()}`,
                  producto_id: 'import',
                  tipo: 'stock' as TipoComponenteReceta,
                  ingrediente_id: ingrediente.id,
                  cantidad,
                  unidad_medida: unidad || ingrediente.unidad_medida,
                  costo_calculado: incidencia || cantidad * ingrediente.costo_por_unidad,
                  created_at: new Date().toISOString(),
                  ingrediente,
                };
              })();

          const yaCargado = draft.receta.find(item =>
            (nuevaLinea.produccion_id && item.produccion_id === nuevaLinea.produccion_id)
            || (nuevaLinea.ingrediente_id && item.ingrediente_id === nuevaLinea.ingrediente_id)
          );

          if (yaCargado) {
            yaCargado.cantidad += nuevaLinea.cantidad;
            yaCargado.costo_calculado += nuevaLinea.costo_calculado;
          } else {
            draft.receta.push(nuevaLinea);
          }
        }

        grouped.set(key, draft);
      });

      const drafts = Array.from(grouped.values());
      if (!drafts.length) {
        setImportError('No pude detectar combos. Usá columnas como Código Combo y Descripción Combo (formato coffee).');
        return;
      }
      setImportInsumos(Array.from(insumosNuevos.values()));
      setImportDrafts(drafts);
    } catch {
      setImportError('No pude leer el archivo. Probá con Excel .xlsx o CSV.');
    }
  };

  const confirmarImportacionCombos = () => {
    if (!importDrafts.length) return;

    if (importInsumos.length) {
      const map = new Map(insumosCatalogo.map(item => [item.id, item]));
      importInsumos.forEach(item => map.set(item.id, item));
      saveDemoIngredientes(Array.from(map.values()));
    }

    setProductos(prev => {
      let next = [...prev];

      importDrafts.forEach((draft, index) => {
        const existing = next.find(producto =>
          normalizeText(producto.nombre) === normalizeText(draft.nombre)
          || (draft.codigo && normalizeText(producto.codigo || '') === normalizeText(draft.codigo))
        );
        const id = existing?.id || `prod-import-${Date.now()}-${index}`;
        const receta = draft.receta.map(item => ({ ...item, producto_id: id }));
        const costoIncidencias = receta.reduce((sum, item) => sum + item.costo_calculado, 0);
        const costoProduccion = costoIncidencias > 0
          ? costoIncidencias
          : (draft.costo_total && draft.costo_total > 0 ? draft.costo_total : 0);
        const precioVenta = draft.precio_venta || existing?.precio_venta || precioPorMargen(costoProduccion, 50) || 0;
        const categoria = categoriasIniciales.find(cat => cat.id === draft.categoria_id);
        const producto: Producto = {
          ...(existing || {}),
          id,
          codigo: draft.codigo || existing?.codigo || `COMBO-${String(index + 1).padStart(3, '0')}`,
          nombre: draft.nombre,
          descripcion: draft.descripcion || existing?.descripcion || '',
          categoria_id: draft.categoria_id,
          precio_venta: precioVenta,
          costo_produccion: costoProduccion,
          margen_ganancia: precioVenta > 0 ? ((precioVenta - costoProduccion) / precioVenta) * 100 : 0,
          disponible: existing?.disponible ?? true,
          agotado: existing?.agotado ?? false,
          activo: existing?.activo ?? true,
          tiempo_preparacion: draft.tiempo_preparacion || 10,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          categoria,
          receta,
        };

        next = existing
          ? next.map(item => item.id === existing.id ? producto : item)
          : [producto, ...next];
      });

      return next;
    });

    setShowImport(false);
    setImportDrafts([]);
    setImportInsumos([]);
    setImportError('');
    setVista('planilla');
    setApartado('combos');
  };

  const margen = (precio: number, costo: number) => precio > 0 ? ((precio - costo) / precio * 100).toFixed(1) : '0';
  const margenColor = (m: number) => m >= 50 ? 'text-emerald-600' : m >= 35 ? 'text-amber-600' : 'text-red-600';
  const redondearPrecio = (precio: number) => Math.ceil(precio / 100) * 100;
  const precioPorMargen = (costo: number, margenDeseado: number) => {
    if (costo <= 0 || margenDeseado <= 0 || margenDeseado >= 100) return 0;
    return redondearPrecio(costo / (1 - margenDeseado / 100));
  };
  const aplicarMargenMasivo = () => {
    const margenDeseado = parseFloat(margenMasivo);
    if (!margenDeseado || margenDeseado <= 0 || margenDeseado >= 100 || productosPrecioSeleccionados.length === 0) return;
    if (!window.confirm(`Esto actualizará el precio de ${productosPrecioSeleccionados.length} productos seleccionados con ${margenDeseado}% de margen. ¿Confirmar?`)) return;

    setProductos(prev => prev.map(producto => {
      if (!productosPrecioSeleccionados.includes(producto.id)) return producto;
      const precioVenta = precioPorMargen(producto.costo_produccion, margenDeseado);
      return {
        ...producto,
        precio_venta: precioVenta || producto.precio_venta,
        margen_ganancia: margenDeseado,
        updated_at: new Date().toISOString(),
      };
    }));
    setProductosPrecioSeleccionados([]);
  };

  const toggleProductoPrecio = (productoId: string) => {
    setProductosPrecioSeleccionados(prev => (
      prev.includes(productoId)
        ? prev.filter(id => id !== productoId)
        : [...prev, productoId]
    ));
  };

  const toggleTodosPreciosVisibles = () => {
    const idsVisibles = filtered.map(producto => producto.id);
    setProductosPrecioSeleccionados(prev => {
      if (todosPreciosVisiblesSeleccionados) {
        return prev.filter(id => !idsVisibles.includes(id));
      }
      return Array.from(new Set([...prev, ...idsVisibles]));
    });
  };
  const actualizarMargenProducto = (productoId: string, margenDeseado: number) => {
    if (!margenDeseado || margenDeseado <= 0 || margenDeseado >= 100) return;
    setProductos(prev => prev.map(producto => {
      if (producto.id !== productoId) return producto;
      const precioVenta = precioPorMargen(producto.costo_produccion, margenDeseado);
      return {
        ...producto,
        precio_venta: precioVenta || producto.precio_venta,
        margen_ganancia: margenDeseado,
        updated_at: new Date().toISOString(),
      };
    }));
  };
  const exportarListaPrecios = () => {
    const headers = ['Producto', 'Categoria', 'Costo', 'Margen %', 'Precio lista', 'Estado'];
    const rows = filtered.map(producto => [
      producto.nombre,
      producto.categoria?.nombre || '',
      producto.costo_produccion,
      margen(producto.precio_venta, producto.costo_produccion),
      producto.precio_venta,
      producto.agotado ? 'Agotado' : producto.disponible ? 'Activo' : 'Inactivo',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-precios-${dayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const limitarDescuento = (valor: number) => Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));

  const actualizarLista = (actualizar: (lista: ListaPrecio) => ListaPrecio) => {
    setListasPrecios(prev => prev.map(lista => (
      lista.metodo_pago === metodoLista
        ? { ...actualizar(lista), updated_at: new Date().toISOString() }
        : lista
    )));
  };

  const actualizarDescuentoGeneral = (valor: number) => {
    actualizarLista(lista => ({ ...lista, descuento_general: limitarDescuento(valor) }));
  };

  const actualizarTipoAjuste = (tipo_ajuste: ListaPrecio['tipo_ajuste']) => {
    actualizarLista(lista => ({ ...lista, tipo_ajuste }));
  };

  const actualizarDescuentoProducto = (productoId: string, valor: number) => {
    actualizarLista(lista => ({
      ...lista,
      descuentos_productos: {
        ...lista.descuentos_productos,
        [productoId]: limitarDescuento(valor),
      },
    }));
  };

  const usarDescuentoGeneral = (productoId?: string) => {
    actualizarLista(lista => {
      if (!productoId) return { ...lista, descuentos_productos: {} };
      const descuentos = { ...lista.descuentos_productos };
      delete descuentos[productoId];
      return { ...lista, descuentos_productos: descuentos };
    });
  };

  const exportarListaSeleccionada = () => {
    if (!listaActual) return;
    const headers = ['Producto', 'Categoria', 'Precio base', 'Tipo de ajuste', 'Porcentaje %', 'Precio final', 'Configuración'];
    const rows = filtered.map(producto => {
      const descuentoProducto = getDescuentoProducto(listaActual, producto.id);
      const factor = listaActual.tipo_ajuste === 'descuento'
        ? 1 - descuentoProducto / 100
        : 1 + descuentoProducto / 100;
      return [
        producto.nombre,
        producto.categoria?.nombre || '',
        producto.precio_venta,
        listaActual.tipo_ajuste === 'descuento' ? 'Descuento' : 'Interés / recargo',
        descuentoProducto,
        Number((producto.precio_venta * factor).toFixed(2)),
        Object.prototype.hasOwnProperty.call(listaActual.descuentos_productos, producto.id) ? 'Personalizado' : 'General',
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-${listaActual.metodo_pago}-${dayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarRecetasCombos = () => {
    const headers = [
      'Código Combo',
      'Descripción Combo',
      'Costo Total',
      'Código Artículo',
      'Descripción Artículo',
      'Costo Unitario Artículo',
      'Cantidad en Combo',
      'Unidad',
      'Incidencia Sobre el Costo del Combo',
    ];
    const rows: (string | number)[][] = [];

    productos.forEach(producto => {
      const receta = producto.receta || [];
      const costoTotal = receta.length ? calcularCostoReceta(receta, insumosCatalogo) : producto.costo_produccion;

      if (receta.length === 0) {
        rows.push([
          producto.codigo || producto.id,
          producto.nombre.toUpperCase(),
          costoTotal,
          '',
          'SIN COMPONENTES CARGADOS',
          0,
          0,
          '',
          0,
        ]);
        return;
      }

      receta.forEach(item => {
        const data = getRecetaItemData(item, insumosCatalogo);
        const prefijo = getRecetaItemTipo(item) === 'produccion' ? 'PRODUCCIÓN' : 'STOCK';
        rows.push([
          producto.codigo || producto.id,
          producto.nombre.toUpperCase(),
          Number(costoTotal.toFixed(2)),
          data.codigo,
          `${prefijo}  ${data.nombre}`.toUpperCase(),
          Number(data.costoUnitario.toFixed(2)),
          item.cantidad,
          'U',
          Number((item.cantidad * data.costoUnitario).toFixed(2)),
        ]);
      });
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet['!autofilter'] = { ref: `A1:I${Math.max(rows.length + 1, 1)}` };
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 34 },
      { wch: 12 },
      { wch: 16 },
      { wch: 34 },
      { wch: 22 },
      { wch: 16 },
      { wch: 10 },
      { wch: 34 },
    ];

    for (let row = 2; row <= rows.length + 1; row += 1) {
      ['C', 'F', 'I'].forEach(column => {
        const cell = worksheet[`${column}${row}`];
        if (cell) cell.z = '#,##0.00';
      });
      const cantidadCell = worksheet[`G${row}`];
      if (cantidadCell) cantidadCell.z = '0.000###';
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Recetas de combos');
    XLSX.writeFile(workbook, `recetas-combos-${dayKey()}.xlsx`);
  };
  const updateRecetaItem = (itemId: string, changes: Partial<RecetaItem>) => {
    setEditForm(form => {
      const receta = (form.receta || []).map(item => {
        if (item.id !== itemId) return item;

        const tipo = (changes.tipo || item.tipo || 'stock') as TipoComponenteReceta;
        const cantidad = changes.cantidad ?? item.cantidad;

        if (tipo === 'produccion') {
          const producciones = loadDemoProducciones();
          const produccionId = changes.produccion_id || item.produccion_id || producciones[0]?.id;
          const produccion = producciones.find(p => p.id === produccionId) || producciones[0];
          const unidad = changes.unidad_medida || produccion?.unidad_medida || item.unidad_medida;

          return {
            ...item,
            ...changes,
            tipo,
            ingrediente_id: undefined,
            ingrediente: undefined,
            produccion_id: produccionId,
            produccion,
            cantidad,
            unidad_medida: unidad,
            costo_calculado: cantidad * (produccion?.costo_unitario || 0),
          };
        }

        const ingredienteId = changes.ingrediente_id || item.ingrediente_id || insumosCatalogo[0]?.id;
        const ingrediente = insumosCatalogo.find(i => i.id === ingredienteId) || item.ingrediente || insumosCatalogo[0];
        const unidad = changes.unidad_medida || ingrediente?.unidad_medida || item.unidad_medida;

        return {
          ...item,
          ...changes,
          tipo,
          ingrediente_id: ingredienteId,
          ingrediente,
          produccion_id: undefined,
          produccion: undefined,
          cantidad,
          unidad_medida: unidad,
          costo_calculado: cantidad * (ingrediente?.costo_por_unidad || 0),
        };
      });

      return {
        ...form,
        receta,
        costo_produccion: receta.length > 0 ? calcularCostoReceta(receta, insumosCatalogo) : form.costo_produccion,
      };
    });
  };

  const addRecetaItem = () => {
    setEditForm(form => {
      const productId = selectedProducto?.id || 'combo-nuevo';
      const receta = [...(form.receta || []), createRecetaItem(productId)];
      return {
        ...form,
        receta,
        costo_produccion: calcularCostoReceta(receta, insumosCatalogo),
      };
    });
  };

  const removeRecetaItem = (itemId: string) => {
    setEditForm(form => {
      const receta = (form.receta || []).filter(item => item.id !== itemId);
      return {
        ...form,
        receta,
        costo_produccion: receta.length > 0 ? calcularCostoReceta(receta, insumosCatalogo) : 0,
      };
    });
  };

  const costoRecetaActual = calcularCostoReceta(editForm.receta || [], insumosCatalogo);
  const costoProduccionActual = (editForm.receta?.length || 0) > 0 ? costoRecetaActual : editForm.costo_produccion || 0;

  const filasPlanilla = filtered.flatMap(producto => {
    const receta = producto.receta || [];
    const costoTotal = receta.length ? calcularCostoReceta(receta, insumosCatalogo) : producto.costo_produccion;
    if (!receta.length) {
      return [{
        key: `${producto.id}-empty`,
        codigoCombo: producto.codigo || producto.id,
        descripcionCombo: producto.nombre,
        costoTotal,
        codigoArticulo: '',
        descripcionArticulo: 'Sin componentes',
        costoUnitario: 0,
        cantidad: 0,
        unidad: '',
        incidencia: 0,
        producto,
      }];
    }
    return receta.map(item => {
      const data = getRecetaItemData(item, insumosCatalogo);
      const prefijo = getRecetaItemTipo(item) === 'produccion' ? 'PRODUCCIÓN' : 'STOCK';
      return {
        key: `${producto.id}-${item.id}`,
        codigoCombo: producto.codigo || producto.id,
        descripcionCombo: producto.nombre,
        costoTotal,
        codigoArticulo: data.codigo,
        descripcionArticulo: `${prefijo}  ${data.nombre}`,
        costoUnitario: data.costoUnitario,
        cantidad: item.cantidad,
        unidad: 'U',
        incidencia: item.cantidad * data.costoUnitario,
        producto,
      };
    });
  });

  useEffect(() => {
    if (!apartadoInicial) return;
    setApartado(apartadoInicial);
    setVista(apartadoInicial === 'precios' ? 'precios' : apartadoInicial === 'listas' ? 'listas' : 'catalogo');
  }, [apartadoInicial]);

  useEffect(() => {
    saveProductos(productos);
  }, [productos]);

  useEffect(() => {
    saveListasPrecios(listasPrecios);
  }, [listasPrecios]);

  if (!apartado) {
    return (
      <div className="space-y-5">
        <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 to-blue-950 px-6 py-5">
            <h2 className="text-white font-bold text-xl">Productos</h2>
            <p className="text-slate-300 text-sm mt-1">Elegí a qué apartado querés entrar.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          <button
            onClick={() => {
              setApartado('combos');
              setVista('catalogo');
            }}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-amber-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
              <Grid3X3 size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Combos</h3>
            <p className="text-sm text-slate-500 mt-1">Crear, editar y ver los combos del menú con sus recetas y costos.</p>
            <p className="text-xs font-semibold text-amber-600 mt-4">{productos.length} combos cargados</p>
          </button>

          <button
            onClick={() => {
              setApartado('precios');
              setVista('precios');
            }}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
              <List size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Lista de precio</h3>
            <p className="text-sm text-slate-500 mt-1">Consultar precios, costos y márgenes de cada producto.</p>
            <p className="text-xs font-semibold text-blue-600 mt-4">Editar precios base</p>
          </button>

          <button
            onClick={() => {
              setApartado('listas');
              setVista('listas');
            }}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-emerald-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <BadgePercent size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Diferentes listas</h3>
            <p className="text-sm text-slate-500 mt-1">Configurar descuentos e intereses según el medio de pago.</p>
            <p className="text-xs font-semibold text-emerald-600 mt-4">5 medios de pago configurables</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {apartado === 'listas' ? 'Diferentes listas' : apartado === 'precios' ? 'Lista de precio' : 'Combos'}
          </h2>
          <p className="text-sm text-slate-500">
            {apartado === 'listas'
              ? 'Descuentos e intereses automáticos según el medio de pago'
              : apartado === 'precios'
                ? 'Precios base, costos y márgenes de venta'
              : vista === 'planilla'
                ? 'Misma estructura que el Excel: combo, artículos, costos e incidencia'
                : 'Catálogo y recetas de combos'}
          </p>
        </div>
        {apartado === 'combos' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setVista('catalogo')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  vista === 'catalogo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Catálogo
              </button>
              <button
                onClick={() => setVista('planilla')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  vista === 'planilla' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Planilla recetas
              </button>
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors"
            >
              <Upload size={16} />
              Importar planilla
            </button>
            <button
              onClick={exportarRecetasCombos}
              className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors"
            >
              <Download size={16} />
              Exportar recetas
            </button>
            <button
              onClick={openNew}
              className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors"
            >
              <Plus size={16} />
              Agregar combo
            </button>
          </div>
        )}
        {apartado === 'precios' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleTodosPreciosVisibles}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {todosPreciosVisiblesSeleccionados ? 'Quitar visibles' : 'Seleccionar visibles'}
            </button>
            {productosPrecioSeleccionados.length > 0 && (
              <button
                onClick={() => setProductosPrecioSeleccionados([])}
                className="rounded-xl px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Limpiar selección
              </button>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold text-slate-500">
                Margen para {productosPrecioSeleccionados.length} seleccionado{productosPrecioSeleccionados.length === 1 ? '' : 's'} %
              </span>
              <input
                type="number"
                value={margenMasivo}
                onChange={e => setMargenMasivo(e.target.value)}
                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:border-amber-400"
                min="1"
                max="99"
                placeholder="45"
              />
              <button
                onClick={aplicarMargenMasivo}
                disabled={productosPrecioSeleccionados.length === 0 || !margenMasivo}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-900 transition-colors"
              >
                Aplicar
              </button>
            </div>
            <button
              onClick={exportarListaPrecios}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download size={15} />
              Exportar lista
            </button>
          </div>
        )}
        {apartado === 'listas' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-emerald-600 px-2">Los cambios se guardan automáticamente</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <select
                value={listaActual?.tipo_ajuste || 'descuento'}
                onChange={e => actualizarTipoAjuste(e.target.value as ListaPrecio['tipo_ajuste'])}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold outline-none focus:border-amber-400"
              >
                <option value="descuento">Descuento</option>
                <option value="recargo">Interés / recargo</option>
              </select>
              <span className="text-xs font-semibold text-slate-500">Porcentaje general</span>
              <input
                type="number"
                value={listaActual?.descuento_general ?? 0}
                onChange={e => actualizarDescuentoGeneral(parseFloat(e.target.value) || 0)}
                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:border-amber-400"
                min="0"
                max="100"
                step="0.1"
              />
              <span className="text-sm font-semibold text-slate-500">%</span>
              <button
                onClick={() => usarDescuentoGeneral()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                Aplicar a todos
              </button>
            </div>
            <button
              onClick={exportarListaSeleccionada}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download size={15} />
              Exportar {listaActual?.nombre}
            </button>
          </div>
        )}
      </div>

      {apartado === 'listas' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {metodosListasPrecio.map(config => {
            const lista = listasPrecios.find(item => item.metodo_pago === config.metodo);
            const seleccionada = metodoLista === config.metodo;
            return (
              <button
                key={config.metodo}
                onClick={() => setMetodoLista(config.metodo)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  seleccionada
                    ? 'border-amber-400 bg-amber-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-bold ${seleccionada ? 'text-amber-800' : 'text-slate-800'}`}>{config.nombre}</p>
                <p className="text-xs text-slate-500 mt-1">{config.descripcion}</p>
                <p className={`text-lg font-bold mt-3 ${seleccionada ? 'text-amber-600' : 'text-slate-600'}`}>
                  {lista?.descuento_general || 0}% {lista?.tipo_ajuste === 'recargo' ? 'interés' : 'descuento'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {apartado === 'combos' && sinDescuento.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {sinDescuento.length === 1
                ? '1 producto no descuenta stock al venderse'
                : `${sinDescuento.length} productos no descuentan stock al venderse`}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Sin insumos vinculados, al cobrarlos el stock queda igual. Vinculalos para que cada venta descuente lo que corresponde.
            </p>
          </div>
          <button
            onClick={abrirVinculacionStock}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            Revisar y vincular
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Categorías</p>
            <button
              onClick={() => setCategoriaFiltro('todos')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                categoriaFiltro === 'todos' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Todos
              <span className="text-xs opacity-80">{productos.length}</span>
            </button>
          </div>
          <div className="p-2 space-y-1">
            {categoriasIniciales.map(cat => {
              const count = productos.filter(p => p.categoria_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoriaFiltro(cat.id)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    categoriaFiltro === cat.id ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{cat.nombre}</span>
                  <span className="text-xs text-slate-400">{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-1 max-w-md">
              <Search size={14} className="text-slate-400" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar combo..."
                className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
              />
            </div>
            <div className="text-sm text-slate-500">
              {filtered.length} resultados
            </div>
          </div>

          {vista === 'catalogo' ? (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(prod => {
                const m = parseFloat(margen(prod.precio_venta, prod.costo_produccion));
                const cantidadArticulos = (prod.receta || []).length;
                return (
                  <div
                    key={prod.id}
                    onClick={() => setDetalleCombo(prod)}
                    className={`rounded-2xl border border-slate-200 p-4 hover:shadow-md hover:border-amber-300 cursor-pointer transition-all ${!prod.disponible ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-700 font-bold text-lg flex-shrink-0">
                        {prod.nombre[0]}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(prod); }}
                        className="p-2 rounded-xl text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        title="Editar combo"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                    <p className="text-[11px] font-bold text-amber-600 mb-1">{prod.codigo || 'Sin código'}</p>
                    <p className="font-bold text-slate-800">{prod.nombre}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {cantidadArticulos > 0
                        ? `${cantidadArticulos} artículo${cantidadArticulos === 1 ? '' : 's'} · tocá para ver la receta`
                        : 'Sin artículos cargados'}
                    </p>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: prod.categoria?.color + '20', color: prod.categoria?.color }}>
                        {prod.categoria?.nombre}
                      </span>
                      <span className={`text-xs font-bold ${margenColor(m)}`}>{m}% margen</span>
                    </div>
                    <div className="flex items-end justify-between mt-4 pt-4 border-t border-slate-100">
                      <div>
                        <p className="text-xs text-slate-400">Costo / Precio</p>
                        <p className="text-sm font-semibold text-slate-600">${prod.costo_produccion.toLocaleString()}</p>
                        <p className="text-xl font-bold text-slate-900">${prod.precio_venta.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); toggleAgotado(prod.id); }}
                          className={`p-2 rounded-xl transition-colors ${prod.agotado ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400 hover:text-amber-600'}`}
                          title={prod.agotado ? 'Marcar disponible' : 'Marcar agotado'}
                        >
                          <AlertTriangle size={15} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); toggleDisponible(prod.id); }}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                          title={prod.disponible ? 'Deshabilitar' : 'Habilitar'}
                        >
                          {prod.disponible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-3 py-12 text-center text-sm text-slate-400">
                  No hay combos con ese filtro.
                </div>
              )}
            </div>
          ) : vista === 'planilla' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Código Combo</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción Combo</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo Total</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Código Artículo</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción Artículo</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo Unitario</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cantidad</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidad</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Incidencia</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filasPlanilla.map(fila => (
                    <tr key={fila.key} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-sm font-semibold text-amber-700 whitespace-nowrap">{fila.codigoCombo}</td>
                      <td className="py-2.5 px-3 text-sm font-medium text-slate-800">{fila.descripcionCombo}</td>
                      <td className="py-2.5 px-3 text-right text-sm text-slate-700">${fila.costoTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-sm text-slate-600 whitespace-nowrap">{fila.codigoArticulo || '-'}</td>
                      <td className="py-2.5 px-3 text-sm text-slate-700">{fila.descripcionArticulo}</td>
                      <td className="py-2.5 px-3 text-right text-sm text-slate-600">${fila.costoUnitario.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-right text-sm text-slate-700">{fila.cantidad}</td>
                      <td className="py-2.5 px-3 text-center text-sm text-slate-500">{fila.unidad || '-'}</td>
                      <td className="py-2.5 px-3 text-right text-sm font-semibold text-slate-800">${fila.incidencia.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => openEdit(fila.producto)}
                          className="p-2 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                          title="Editar combo"
                        >
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filasPlanilla.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-sm text-slate-400">
                        No hay filas de receta. Importá una planilla como coffee2.xlsx para ver combos con artículos, costos e incidencia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {vista === 'precios' ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={todosPreciosVisiblesSeleccionados}
                            onChange={toggleTodosPreciosVisibles}
                            aria-label="Seleccionar todos los productos visibles"
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Producto</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoría</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Precio lista</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Margen %</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Editar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map(prod => {
                        const margenActual = parseFloat(margen(prod.precio_venta, prod.costo_produccion));
                        return (
                          <tr key={prod.id} className={`hover:bg-slate-50 transition-colors ${productosPrecioSeleccionados.includes(prod.id) ? 'bg-amber-50/60' : ''} ${!prod.disponible ? 'opacity-60' : ''}`}>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={productosPrecioSeleccionados.includes(prod.id)}
                                onChange={() => toggleProductoPrecio(prod.id)}
                                aria-label={`Seleccionar ${prod.nombre}`}
                                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-800 text-sm">{prod.nombre}</p>
                              <p className="text-[11px] font-semibold text-amber-600">{prod.codigo || 'Sin código'}</p>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-500">{prod.categoria?.nombre || '-'}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800">${prod.precio_venta.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-sm text-slate-500">${prod.costo_produccion.toLocaleString()}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  key={`${prod.id}-${prod.precio_venta}`}
                                  type="number"
                                  defaultValue={margenActual.toFixed(1)}
                                  onBlur={e => actualizarMargenProducto(prod.id, parseFloat(e.target.value))}
                                  className="w-20 border border-slate-200 rounded-xl px-2 py-1.5 text-sm text-right font-semibold outline-none focus:border-amber-400"
                                  min="1"
                                  max="99"
                                  step="0.1"
                                />
                                <span className={`text-xs font-bold ${margenColor(margenActual)}`}>%</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${prod.agotado ? 'bg-red-100 text-red-600' : prod.disponible ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                {prod.agotado ? 'Agotado' : prod.disponible ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button onClick={() => openEdit(prod)} className="p-2 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Editar producto">
                                <Edit2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Producto</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoría</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Precio base</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Porcentaje</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Precio con {listaActual?.tipo_ajuste === 'recargo' ? 'interés' : 'descuento'}
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Configuración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(prod => {
                    const descuentoProducto = listaActual ? getDescuentoProducto(listaActual, prod.id) : 0;
                    const personalizado = !!listaActual && Object.prototype.hasOwnProperty.call(listaActual.descuentos_productos, prod.id);
                    const esRecargo = listaActual?.tipo_ajuste === 'recargo';
                    const precioFinal = prod.precio_venta * (esRecargo ? 1 + descuentoProducto / 100 : 1 - descuentoProducto / 100);
                    return (
                      <tr key={prod.id} className={`hover:bg-slate-50 transition-colors ${!prod.disponible ? 'opacity-60' : ''}`}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-800 text-sm">{prod.nombre}</p>
                          <p className="text-[11px] font-semibold text-amber-600">{prod.codigo || 'Sin código'}</p>
                          <p className="text-xs text-slate-400 truncate max-w-64">{prod.descripcion}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: prod.categoria?.color + '20', color: prod.categoria?.color }}>
                            {prod.categoria?.nombre}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">${prod.precio_venta.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              value={descuentoProducto}
                              onChange={e => actualizarDescuentoProducto(prod.id, parseFloat(e.target.value) || 0)}
                              className={`w-20 border border-slate-200 rounded-xl px-2 py-1.5 text-sm text-right font-semibold outline-none focus:border-amber-400 ${esRecargo ? 'text-orange-700' : 'text-emerald-700'}`}
                              min="0"
                              max="100"
                              step="0.1"
                            />
                            <span className="text-xs font-bold text-slate-500">%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className={`font-bold ${esRecargo ? 'text-orange-700' : 'text-emerald-700'}`}>${precioFinal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</p>
                          {descuentoProducto > 0 && (
                            <p className={`text-xs ${esRecargo ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {esRecargo ? 'Interés' : 'Ahorrás'} ${Math.abs(prod.precio_venta - precioFinal).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {personalizado ? (
                            <button
                              onClick={() => usarDescuentoGeneral(prod.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                              title={`Volver al ${listaActual?.descuento_general || 0}% general`}
                            >
                              Personalizado · usar general
                            </button>
                          ) : (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-medium">Porcentaje general</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              )}
            </>
          )}
        </section>
      </div>

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Importar combos desde planilla</h3>
                <p className="text-sm text-slate-500">Compatible con el formato coffee: una fila por artículo del combo.</p>
              </div>
              <button onClick={() => setShowImport(false)}><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer transition-colors">
                  <Upload size={26} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Subir Excel o CSV</p>
                  <p className="text-xs text-slate-400 mt-1">Ej: coffee2.xlsx con Código Combo + Descripción Artículo</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void procesarPlanillaCombos(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Columnas del Excel</h4>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p><span className="font-semibold">Código Combo</span> · B0014</p>
                    <p><span className="font-semibold">Descripción Combo</span> · AMERICANO</p>
                    <p><span className="font-semibold">Costo Total</span> · costo del combo</p>
                    <p><span className="font-semibold">Código Artículo</span> · A3</p>
                    <p><span className="font-semibold">Descripción Artículo</span> · STOCK CAFE</p>
                    <p><span className="font-semibold">Costo Unitario / Cantidad / Unidad / Incidencia</span></p>
                  </div>
                </div>
              </div>

              {importError && (
                <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  {importError}
                </div>
              )}

              {importDrafts.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Vista previa</h4>
                      <p className="text-xs text-slate-500">{importDrafts.length} combos detectados</p>
                    </div>
                    <button
                      onClick={confirmarImportacionCombos}
                      className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                    >
                      <Check size={15} />
                      Confirmar carga
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Combo</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Código</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Componentes</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Costo</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Precio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {importDrafts.map(draft => {
                          const costo = draft.costo_total && draft.costo_total > 0
                            ? draft.costo_total
                            : calcularCostoReceta(draft.receta, [...insumosCatalogo, ...importInsumos]);
                          const categoria = categoriasIniciales.find(cat => cat.id === draft.categoria_id);
                          return (
                            <tr key={draft.key}>
                              <td className="py-3 px-3">
                                <p className="text-sm font-semibold text-slate-800">{draft.nombre}</p>
                                <p className="text-xs text-slate-400">{draft.receta.slice(0, 2).map(r => getRecetaItemData(r, [...insumosCatalogo, ...importInsumos]).nombre).join(', ') || 'Sin artículos'}{draft.receta.length > 2 ? '…' : ''}</p>
                              </td>
                              <td className="py-3 px-3 text-sm font-semibold text-amber-700">{draft.codigo || '-'}</td>
                              <td className="py-3 px-3 text-sm text-slate-600">{categoria?.nombre || 'Combos'}</td>
                              <td className="py-3 px-3 text-right text-sm text-slate-600">{draft.receta.length}</td>
                              <td className="py-3 px-3 text-right text-sm font-semibold text-slate-800">${costo.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                              <td className="py-3 px-3 text-right text-sm font-bold text-amber-700">${(draft.precio_venta || 0).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg">
                {selectedProducto ? 'Editar Combo' : 'Nuevo Combo'}
              </h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Código de combo</label>
                  <input
                    value={editForm.codigo || ''}
                    onChange={e => setEditForm(f => ({ ...f, codigo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 font-semibold"
                    placeholder="Ej: COMBO-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                  <input
                    value={editForm.nombre || ''}
                    onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Nombre del combo"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                  <textarea
                    value={editForm.descripcion || ''}
                    onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                    rows={2}
                    placeholder="Descripción breve del combo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                  <select
                    value={editForm.categoria_id || ''}
                    onChange={e => setEditForm(f => ({ ...f, categoria_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="">Sin categoría</option>
                    {categoriasIniciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tiempo prep. (min)</label>
                  <input
                    type="number"
                    value={editForm.tiempo_preparacion || ''}
                    onChange={e => setEditForm(f => ({ ...f, tiempo_preparacion: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de Venta $</label>
                  <input
                    type="number"
                    value={editForm.precio_venta || ''}
                    onChange={e => setEditForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 font-semibold"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Costo de Producción $</label>
                  <input
                    type="number"
                    value={costoProduccionActual || ''}
                    onChange={e => setEditForm(f => ({ ...f, costo_produccion: parseFloat(e.target.value) || 0 }))}
                    readOnly={(editForm.receta?.length || 0) > 0}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 read-only:bg-slate-50"
                    min="0"
                  />
                  {(editForm.receta?.length || 0) > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">Calculado por los insumos de la receta.</p>
                  )}
                </div>
                <div className="col-span-2 border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Receta / stock que consume</h4>
                      <p className="text-xs text-slate-500">Definí si descuenta insumos de stock o producciones preparadas.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addRecetaItem}
                      className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-xl text-xs transition-colors"
                    >
                      <Plus size={14} />
                      Agregar componente
                    </button>
                  </div>

                  {(editForm.receta?.length || 0) > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px]">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Origen</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Componente</th>
                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                            <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Unidad</th>
                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Costo unit.</th>
                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Costo línea</th>
                            <th className="py-2.5 px-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(editForm.receta || []).map(item => {
                            const tipo = getRecetaItemTipo(item);
                            const data = getRecetaItemData(item, insumosCatalogo);
                            const costoUnitario = data.costoUnitario;
                            const costoLinea = item.cantidad * costoUnitario;
                            const sinStock = item.cantidad > data.stockActual;

                            return (
                              <tr key={item.id}>
                                <td className="py-2.5 px-3">
                                  <select
                                    value={tipo}
                                    onChange={e => updateRecetaItem(item.id, { tipo: e.target.value as TipoComponenteReceta })}
                                    className="w-32 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                                  >
                                    <option value="stock">Stock</option>
                                    <option value="produccion">Producción</option>
                                  </select>
                                </td>
                                <td className="py-2.5 px-3">
                                  <select
                                    value={tipo === 'produccion' ? item.produccion_id || loadDemoProducciones()[0]?.id : item.ingrediente_id || insumosCatalogo[0]?.id}
                                    onChange={e => (
                                      tipo === 'produccion'
                                        ? updateRecetaItem(item.id, { produccion_id: e.target.value })
                                        : updateRecetaItem(item.id, { ingrediente_id: e.target.value })
                                    )}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                                  >
                                    {tipo === 'produccion'
                                      ? loadDemoProducciones().map(prod => (
                                          <option key={prod.id} value={prod.id}>{prod.nombre}</option>
                                        ))
                                      : insumosCatalogo.map(ing => (
                                          <option key={ing.id} value={ing.id}>{ing.codigo ? `${ing.codigo} · ` : ''}{ing.nombre}</option>
                                        ))}
                                  </select>
                                  <p className={`text-[11px] mt-1 ${sinStock ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                                    {data.stockLabel}: {data.stockActual.toLocaleString()} {data.unidad}
                                    {sinStock ? ' · insuficiente' : ''}
                                  </p>
                                </td>
                                <td className="py-2.5 px-3">
                                  <input
                                    type="number"
                                    value={item.cantidad || ''}
                                    onChange={e => updateRecetaItem(item.id, { cantidad: parseFloat(e.target.value) || 0 })}
                                    className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400"
                                    min="0"
                                    step="0.001"
                                  />
                                </td>
                                <td className="py-2.5 px-3">
                                  <select
                                    value={item.unidad_medida}
                                    onChange={e => updateRecetaItem(item.id, { unidad_medida: e.target.value as UnidadMedida })}
                                    className="w-32 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                                  >
                                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td className="py-2.5 px-3 text-right text-sm text-slate-600">
                                  ${costoUnitario.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-right text-sm font-bold text-slate-800">
                                  ${costoLinea.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeRecetaItem(item.id)}
                                    className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Quitar insumo"
                                  >
                                    <X size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Costo total por receta</p>
                          <p className="text-lg font-bold text-slate-800">${costoRecetaActual.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 text-center">
                      <p className="text-sm font-semibold text-amber-700">Sin componentes, este producto no descuenta stock al venderse.</p>
                      {insumosCatalogo.length === 0 ? (
                        <p className="text-xs text-amber-600 mt-1">
                          Primero cargá tus insumos en la pantalla Stock para poder armar la receta.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1">
                          Si se vende tal cual, agregá un solo componente con cantidad 1. Si es elaborado, sumá los insumos o las producciones que consume.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {editForm.precio_venta && costoProduccionActual > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Ganancia por unidad:</span>
                    <span className="font-bold text-amber-800">${(editForm.precio_venta - costoProduccionActual).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-amber-700">Margen:</span>
                    <span className="font-bold text-amber-800">{margen(editForm.precio_venta, costoProduccionActual)}%</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium">Cancelar</button>
              <button onClick={saveProducto} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2">
                <Check size={16} />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showVinculacionStock && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-start gap-3 p-6 border-b border-slate-100">
              <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-lg">Productos que no descuentan stock</h3>
                <p className="text-sm text-slate-500">
                  Elegí de qué insumo sale cada producto y cuánto se gasta por unidad vendida. Si un producto se vende tal cual, dejá la cantidad en 1.
                </p>
              </div>
              <button
                onClick={() => setShowVinculacionStock(false)}
                aria-label="Cerrar vinculación de stock"
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {insumosCatalogo.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Todavía no tenés insumos cargados. Cargalos en la pantalla Stock y volvé acá para vincularlos.
                </p>
              ) : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {sinDescuento.map(producto => {
                    const vinculo = vinculos[producto.id] || { cantidad: '1' };
                    const ingrediente = insumosCatalogo.find(item => item.id === vinculo.ingredienteId);
                    const cantidad = parseFloat(vinculo.cantidad) || 0;
                    const listo = Boolean(ingrediente) && cantidad > 0;

                    return (
                      <div key={producto.id} className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800 truncate">{producto.nombre}</p>
                          <button
                            onClick={() => { setShowVinculacionStock(false); openEdit(producto); }}
                            className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            Receta detallada
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <BuscadorInsumo
                            ingredientes={insumosCatalogo}
                            ingredienteId={vinculo.ingredienteId}
                            modoNuevo={false}
                            nombreLeido={producto.nombre}
                            onSeleccionar={item => setVinculos(prev => ({
                              ...prev,
                              [producto.id]: { ...prev[producto.id], ingredienteId: item.id },
                            }))}
                            onCrearNuevo={() => undefined}
                            permitirCrear={false}
                            className="flex-1 min-w-0"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={vinculo.cantidad}
                              onChange={e => setVinculos(prev => ({
                                ...prev,
                                [producto.id]: { ...prev[producto.id], cantidad: e.target.value },
                              }))}
                              min="0"
                              step="0.001"
                              aria-label={`Cantidad de insumo por cada ${producto.nombre}`}
                              className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400"
                            />
                            <span className="text-xs text-slate-500 w-16 truncate">{ingrediente?.unidad_medida || 'unidad'}</span>
                            <button
                              onClick={() => vincularConInsumo(producto)}
                              disabled={!listo}
                              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500"
                            >
                              Vincular
                            </button>
                          </div>
                        </div>

                        {listo && (
                          <p className="text-xs text-slate-500">
                            Al vender 1 {producto.nombre} se van a descontar {cantidad.toLocaleString()} {ingrediente!.unidad_medida} de {ingrediente!.nombre}.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {sinDescuento.length === 0 && (
                    <div className="px-4 py-10 text-center">
                      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Check size={20} className="text-emerald-600" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Listo, todos los productos descuentan stock</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end p-6 border-t border-slate-100">
              <button
                onClick={() => setShowVinculacionStock(false)}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {detalleCombo && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto" onClick={() => setDetalleCombo(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-amber-600">{detalleCombo.codigo || 'Sin código'}</p>
                <h3 className="font-bold text-slate-800 text-lg">{detalleCombo.nombre}</h3>
                <p className="text-sm text-slate-500">Todo lo que lleva este combo para prepararlo.</p>
              </div>
              <button onClick={() => setDetalleCombo(null)}><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Artículos</p>
                  <p className="text-lg font-bold text-slate-800">{(detalleCombo.receta || []).length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Costo total</p>
                  <p className="text-lg font-bold text-slate-800">
                    ${detalleCombo.costo_produccion.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-700">Precio venta</p>
                  <p className="text-lg font-bold text-amber-800">${detalleCombo.precio_venta.toLocaleString()}</p>
                </div>
              </div>

              {(detalleCombo.receta || []).length > 0 ? (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Código</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Artículo</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                        <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Unidad</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Costo unit.</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Incidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(detalleCombo.receta || []).map(item => {
                        const data = getRecetaItemData(item, insumosCatalogo);
                        const esProduccion = getRecetaItemTipo(item) === 'produccion';
                        return (
                          <tr key={item.id}>
                            <td className="py-2.5 px-3 text-sm text-slate-500 whitespace-nowrap">{data.codigo || '-'}</td>
                            <td className="py-2.5 px-3">
                              <p className="text-sm font-medium text-slate-800">{data.nombre}</p>
                              <p className="text-[11px] text-slate-400">{esProduccion ? 'Producción propia' : 'Stock'}</p>
                            </td>
                            <td className="py-2.5 px-3 text-right text-sm font-semibold text-slate-700">{item.cantidad}</td>
                            <td className="py-2.5 px-3 text-center text-sm text-slate-500">{data.unidad}</td>
                            <td className="py-2.5 px-3 text-right text-sm text-slate-600">
                              ${data.costoUnitario.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right text-sm font-bold text-slate-800">
                              ${(item.cantidad * data.costoUnitario).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm text-slate-500">Este combo todavía no tiene artículos cargados.</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setDetalleCombo(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium"
              >
                Cerrar
              </button>
              <button
                onClick={() => { const prod = detalleCombo; setDetalleCombo(null); openEdit(prod); }}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 size={15} />
                Editar receta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
