import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import {
  Plus,
  AlertTriangle,
  TrendingDown,
  Package,
  CreditCard as Edit2,
  X,
  Check,
  ArrowDownCircle,
  ArrowUpCircle,
  Upload,
  Camera,
  FileText,
  Trash2,
  Loader2,
  Download,
} from 'lucide-react';
import type { CompraDraft, CompraItemDraft, CondicionPagoCompra, Ingrediente, MetodoPago, MovimientoStock, OrigenCompra, ProduccionPreparada, RegistroProduccion, UnidadMedida } from '../lib/types';
import { loadProveedores } from '../lib/proveedoresStore';
import { crearFacturaProveedor, loadCuentasDinero, registrarPagoProveedor } from '../lib/finance';
import {
  loadDemoIngredientes,
  loadDemoMovimientosStock,
  loadDemoProducciones,
  loadDemoRegistrosProduccion,
  saveDemoIngredientes,
  saveDemoMovimientosStock,
  saveDemoProducciones,
  saveDemoRegistrosProduccion,
} from '../lib/demoStore';

const unidades: UnidadMedida[] = ['gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete'];
const motivosConsumo = [
  'Consumo del personal',
  'Merma',
  'Rotura',
  'Vencimiento',
  'Invitacion / cortesia',
  'Prueba de cocina',
  'Uso interno',
  'Ajuste de stock',
];

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const getProveedor = (proveedorId?: string) =>
  loadProveedores().find(p => p.id === proveedorId);

const getProveedorNombre = (ingrediente: Ingrediente | Partial<Ingrediente>) =>
  getProveedor(ingrediente.proveedor_id)?.nombre || 'Sin proveedor';

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyCompraDraft = (): CompraDraft => ({
  id: createId('compra'),
  origen: 'manual',
  fecha: new Date().toISOString().slice(0, 10),
  vencimiento: new Date().toISOString().slice(0, 10),
  total: 0,
  observaciones: '',
  items: [],
  condicion_pago: 'pendiente',
  cuenta_origen_id: 'cuenta-caja-grande',
  monto_pagado: 0,
});

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(,|$))/g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const inferUnidad = (text: string): UnidadMedida => {
  const normalized = normalizeText(text);
  if (/\bkg\b|kilo/.test(normalized)) return 'kilos';
  if (/\bgr?\b|gram/.test(normalized)) return 'gramos';
  if (/\bml\b|mililit/.test(normalized)) return 'mililitros';
  if (/\blt?\b|litro/.test(normalized)) return 'litros';
  if (/feta/.test(normalized)) return 'feta';
  if (/porcion/.test(normalized)) return 'porcion';
  if (/paquete|pack/.test(normalized)) return 'paquete';
  return 'unidad';
};

const unidadExcel = (unidad: UnidadMedida) => {
  if (unidad === 'kilos' || unidad === 'gramos') return 'K';
  if (unidad === 'litros' || unidad === 'mililitros') return 'L';
  return 'U';
};

const findBestIngredienteMatch = (nombre: string, ingredientes: Ingrediente[]) => {
  const normalized = normalizeText(nombre);
  if (!normalized) return null;
  const words = normalized.split(' ').filter(word => word.length > 2);

  return ingredientes
    .map(ing => {
      const ingName = normalizeText(ing.nombre);
      const exact = ingName === normalized ? 3 : 0;
      const contains = ingName.includes(normalized) || normalized.includes(ingName) ? 2 : 0;
      const overlap = words.filter(word => ingName.includes(word)).length / Math.max(words.length, 1);
      return { ingrediente: ing, score: exact + contains + overlap };
    })
    .sort((a, b) => b.score - a.score)[0];
};

const createCompraItem = (
  data: Partial<CompraItemDraft>,
  ingredientes: Ingrediente[],
  proveedorId?: string
): CompraItemDraft => {
  const match = findBestIngredienteMatch(data.nombre || '', ingredientes);
  const ingrediente = match && match.score >= 1 ? match.ingrediente : null;

  return {
    id: data.id || createId('item-compra'),
    modo: data.modo || (ingrediente ? 'existente' : 'nuevo'),
    ingrediente_id: data.ingrediente_id || ingrediente?.id,
    nombre: data.nombre || ingrediente?.nombre || '',
    unidad_medida: data.unidad_medida || ingrediente?.unidad_medida || inferUnidad(data.nombre || ''),
    cantidad: data.cantidad || 0,
    costo_unitario: data.costo_unitario || 0,
    proveedor_id: data.proveedor_id || proveedorId || ingrediente?.proveedor_id,
    stock_minimo: data.stock_minimo || 0,
    observaciones: data.observaciones,
    confianza: data.confianza ?? (ingrediente ? Math.min(match?.score || 0, 3) : 0),
  };
};

const parseTextLinesToItems = (text: string): Partial<CompraItemDraft>[] => {
  const ignore = /(total|subtotal|iva|cuit|factura|ticket|fecha|domicilio|telefono|razon social)/i;
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 4 && !ignore.test(line))
    .map(line => {
      const numbers = line.match(/(?:\$?\s*)\d+(?:[.,]\d+)?/g) || [];
      const cantidad = parseNumber(numbers[0]);
      const costo = parseNumber(numbers[numbers.length - 1]);
      const nombre = line
        .replace(/(?:\$?\s*)\d+(?:[.,]\d+)?/g, ' ')
        .replace(/\b(un|uni|unidad|kg|kilos|gr|gramos|lt|litros|ml)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        nombre,
        cantidad,
        costo_unitario: numbers.length > 1 ? costo : 0,
        unidad_medida: inferUnidad(line),
      };
    })
    .filter(item => item.nombre && item.cantidad > 0)
    .slice(0, 30);
};

interface StockProps {
  apartadoInicial?: 'stock' | 'consumos' | 'produccion';
}

export default function Stock({ apartadoInicial = 'stock' }: StockProps) {
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(() => loadDemoIngredientes());
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>(() => loadDemoMovimientosStock());
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Ingrediente> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIngId, setSelectedIngId] = useState<string | null>(null);
  const [showStockCritico, setShowStockCritico] = useState(false);
  const [showStockBajo, setShowStockBajo] = useState(false);
  const [showCompraNecesaria, setShowCompraNecesaria] = useState(false);
  const [showCompra, setShowCompra] = useState(false);
  const [compraPaso, setCompraPaso] = useState<'carga' | 'revision'>('carga');
  const [compraDraft, setCompraDraft] = useState<CompraDraft>(() => emptyCompraDraft());
  const [isProcesandoCompra, setIsProcesandoCompra] = useState(false);
  const [compraError, setCompraError] = useState('');
  const [cuentasDinero] = useState(loadCuentasDinero);
  const [metodoPagoCompra, setMetodoPagoCompra] = useState<MetodoPago>('efectivo');
  const [showConsumoForm, setShowConsumoForm] = useState(false);
  const [consumoIngId, setConsumoIngId] = useState('');
  const [consumoCantidad, setConsumoCantidad] = useState('');
  const [consumoMotivo, setConsumoMotivo] = useState(motivosConsumo[0]);
  const [consumoResponsable, setConsumoResponsable] = useState('');
  const [consumoFecha, setConsumoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [consumoObservaciones, setConsumoObservaciones] = useState('');
  const [filtroConsumoMotivo, setFiltroConsumoMotivo] = useState('todos');
  const [filtroConsumoIngId, setFiltroConsumoIngId] = useState('todos');
  const [filtroConsumoDesde, setFiltroConsumoDesde] = useState('');
  const [filtroConsumoHasta, setFiltroConsumoHasta] = useState('');
  const [producciones, setProducciones] = useState<ProduccionPreparada[]>(() => loadDemoProducciones());
  const [registrosProduccion, setRegistrosProduccion] = useState<RegistroProduccion[]>(() => loadDemoRegistrosProduccion());
  const [showProduccionForm, setShowProduccionForm] = useState(false);
  const [showDefinicionProduccion, setShowDefinicionProduccion] = useState(false);
  const [definicionEditId, setDefinicionEditId] = useState<string | null>(null);
  const [definicionNombre, setDefinicionNombre] = useState('');
  const [definicionDescripcion, setDefinicionDescripcion] = useState('');
  const [definicionUnidad, setDefinicionUnidad] = useState<UnidadMedida>('unidad');
  const [definicionRendimiento, setDefinicionRendimiento] = useState('');
  const [definicionReceta, setDefinicionReceta] = useState<Array<{ id: string; ingrediente_id: string; cantidad: string }>>([]);
  const [definicionError, setDefinicionError] = useState('');
  const [produccionId, setProduccionId] = useState('');
  const [produccionCantidad, setProduccionCantidad] = useState('');
  const [produccionFecha, setProduccionFecha] = useState(new Date().toISOString().slice(0, 10));
  const [produccionResponsable, setProduccionResponsable] = useState('');
  const [produccionObservaciones, setProduccionObservaciones] = useState('');
  const [cantidadesUsadas, setCantidadesUsadas] = useState<Record<string, string>>({});

  const selectedIngrediente = ingredientes.find(i => i.id === selectedIngId) || null;
  const selectedMovimientos = movimientos
    .filter(m => m.ingrediente_id === selectedIngId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const stockBajo = ingredientes.filter(i => i.stock_actual <= i.stock_minimo);
  const todosStockBajo = ingredientes.filter(i => i.stock_actual <= i.stock_minimo * 1.5);
  const compraNecesaria = todosStockBajo.map(i => ({
    ...i,
    cantidad_sugerida: Math.max(i.stock_minimo * 2 - i.stock_actual, 0),
  }));
  const stockOk = ingredientes.filter(i => i.stock_actual > i.stock_minimo * 1.5);
  const compraTotal = useMemo(
    () => compraDraft.items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0),
    [compraDraft.items]
  );
  const compraProveedorId = compraDraft.proveedor_id || compraDraft.items.find(item => item.proveedor_id)?.proveedor_id;
  const montoPagadoCompra = compraDraft.condicion_pago === 'pagada'
    ? compraTotal
    : compraDraft.condicion_pago === 'parcial'
      ? Math.min(compraDraft.monto_pagado || 0, compraTotal)
      : 0;
  const compraTieneErrores = compraDraft.items.some(item =>
    !item.nombre.trim() ||
    item.cantidad <= 0 ||
    (item.modo === 'existente' && !item.ingrediente_id) ||
    (item.modo === 'nuevo' && !item.unidad_medida)
  );
  const consumoIngrediente = ingredientes.find(item => item.id === consumoIngId) || null;
  const consumoCantidadNum = parseFloat(consumoCantidad) || 0;
  const consumoCostoTotal = consumoIngrediente ? consumoCantidadNum * consumoIngrediente.costo_por_unidad : 0;
  const selectedProduccion = producciones.find(item => item.id === produccionId) || null;
  const produccionCantidadNum = parseFloat(produccionCantidad) || 0;
  const produccionFactor = selectedProduccion && selectedProduccion.cantidad_producida > 0
    ? produccionCantidadNum / selectedProduccion.cantidad_producida
    : 0;
  const insumosProduccion = selectedProduccion
    ? selectedProduccion.receta
        .filter(item => (item.tipo || 'stock') === 'stock')
        .map(item => {
          const ingrediente = ingredientes.find(ing => ing.id === item.ingrediente_id) || item.ingrediente || null;
          const estimado = item.cantidad * produccionFactor;
          const requerido = parseFloat(cantidadesUsadas[item.id] ?? String(estimado)) || 0;
          const costo = requerido * (ingrediente?.costo_por_unidad || 0);
          return {
            item,
            ingrediente,
            requerido,
            costo,
            suficiente: !!ingrediente && ingrediente.stock_actual >= requerido,
          };
        })
    : [];
  const produccionTieneFaltantes = insumosProduccion.some(item => !item.suficiente);
  const costoProduccionTotal = insumosProduccion.reduce((sum, item) => sum + item.costo, 0);

  useEffect(() => {
    saveDemoIngredientes(ingredientes);
  }, [ingredientes]);

  useEffect(() => {
    saveDemoMovimientosStock(movimientos);
  }, [movimientos]);

  useEffect(() => {
    saveDemoProducciones(producciones);
  }, [producciones]);

  useEffect(() => {
    saveDemoRegistrosProduccion(registrosProduccion);
  }, [registrosProduccion]);

  const getStockStatus = (ing: Ingrediente) => {
    if (ing.stock_actual <= ing.stock_minimo) return { color: 'bg-red-100 text-red-700', label: 'Crítico', dot: 'bg-red-500' };
    if (ing.stock_actual <= ing.stock_minimo * 1.5) return { color: 'bg-amber-100 text-amber-700', label: 'Bajo', dot: 'bg-amber-500' };
    return { color: 'bg-emerald-100 text-emerald-700', label: 'Normal', dot: 'bg-emerald-500' };
  };

  const descargarExcelStock = () => {
    const rows: (string | number)[][] = [
      ['Codigo', 'Descripcion', 'Unidad', 'cantidad', 'COSTO', 'COSTO', 'TOTALIZACION STOCK'],
      ...ingredientes.map((ing, index) => [
        index + 1,
        ing.nombre.toUpperCase(),
        unidadExcel(ing.unidad_medida),
        ing.stock_actual,
        ing.costo_por_unidad,
        ing.costo_por_unidad,
        ing.stock_actual * ing.costo_por_unidad,
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 10 },
      { wch: 34 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock');
    XLSX.writeFile(workbook, `stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const openEdit = (ing: Ingrediente) => {
    setEditItem({ ...ing });
    setEditId(ing.id);
    setShowForm(true);
  };

  const openNew = () => {
    setEditItem({ nombre: '', unidad_medida: 'unidad', stock_actual: 0, stock_minimo: 0, costo_por_unidad: 0, proveedor_id: '', activo: true });
    setEditId(null);
    setShowForm(true);
  };

  const openCompra = (origen: OrigenCompra = 'manual', items: CompraItemDraft[] = []) => {
    setCompraDraft({
      ...emptyCompraDraft(),
      origen,
      items,
      total: items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0),
    });
    setCompraPaso('carga');
    setCompraError('');
    setShowCompra(true);
  };

  const openCompraFor = (ing: Ingrediente, cantidadSugerida?: number) => {
    openCompra('manual', [
      createCompraItem({
        modo: 'existente',
        ingrediente_id: ing.id,
        nombre: ing.nombre,
        unidad_medida: ing.unidad_medida,
        cantidad: cantidadSugerida && cantidadSugerida > 0 ? cantidadSugerida : 0,
        costo_unitario: ing.costo_por_unidad,
        proveedor_id: ing.proveedor_id,
      }, ingredientes),
    ]);
    setShowCompraNecesaria(false);
    setShowStockBajo(false);
    setShowStockCritico(false);
  };

  const updateCompraItem = (itemId: string, changes: Partial<CompraItemDraft>) => {
    setCompraDraft(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...changes };
        if (changes.ingrediente_id) {
          const ingrediente = ingredientes.find(i => i.id === changes.ingrediente_id);
          if (ingrediente) {
            next.modo = 'existente';
            next.nombre = ingrediente.nombre;
            next.unidad_medida = ingrediente.unidad_medida;
            next.proveedor_id = ingrediente.proveedor_id;
            next.stock_minimo = ingrediente.stock_minimo;
          }
        }
        if (changes.modo === 'nuevo') {
          next.ingrediente_id = undefined;
        }
        return next;
      }),
    }));
  };

  const addCompraItem = (item?: Partial<CompraItemDraft>) => {
    setCompraDraft(prev => ({
      ...prev,
      items: [
        ...prev.items,
        createCompraItem({
          nombre: '',
          unidad_medida: 'unidad',
          cantidad: 0,
          costo_unitario: 0,
          proveedor_id: prev.proveedor_id,
          ...item,
        }, ingredientes, prev.proveedor_id),
      ],
    }));
    setCompraPaso('revision');
  };

  const removeCompraItem = (itemId: string) => {
    setCompraDraft(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId),
    }));
  };

  const appendParsedItems = (items: Partial<CompraItemDraft>[], origen: OrigenCompra, fileName?: string) => {
    if (!items.length) {
      setCompraError('No pude detectar productos automáticamente. Podés cargarlos manualmente en la revisión.');
      setCompraPaso('revision');
      return;
    }
    setCompraDraft(prev => {
      const parsedItems = items.map(item => createCompraItem(item, ingredientes, prev.proveedor_id));
      return {
        ...prev,
        origen,
        comprobante_nombre: fileName || prev.comprobante_nombre,
        items: [...prev.items, ...parsedItems],
      };
    });
    setCompraPaso('revision');
    setCompraError('Revisá los productos detectados antes de confirmar la compra.');
  };

  const readExcelFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

    if (rows.length) {
      return rows.map(row => {
        const entries = Object.entries(row);
        const findValue = (keys: string[]) =>
          entries.find(([key]) => keys.some(target => normalizeText(key).includes(target)))?.[1];
        const nombre = String(findValue(['producto', 'insumo', 'descripcion', 'nombre', 'detalle']) || entries[0]?.[1] || '').trim();
        const cantidad = parseNumber(findValue(['cantidad', 'cant', 'unidades']));
        const costo = parseNumber(findValue(['costo', 'precio', 'unitario', 'importe']));
        const unidadRaw = String(findValue(['unidad', 'medida']) || nombre);
        return { nombre, cantidad, costo_unitario: costo, unidad_medida: inferUnidad(unidadRaw) };
      }).filter(item => item.nombre && item.cantidad > 0);
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
    return matrix.map(row => ({
      nombre: String(row[0] || '').trim(),
      cantidad: parseNumber(row[1]),
      costo_unitario: parseNumber(row[2]),
      unidad_medida: inferUnidad(String(row[3] || row[0] || '')),
    })).filter(item => item.nombre && item.cantidad > 0);
  };

  const readPdfFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items.map(item => ('str' in item ? item.str : '')).join(' ');
      })
    );
    return parseTextLinesToItems(pages.join('\n'));
  };

  const readImageFile = async (file: File) => {
    const worker = await createWorker('spa');
    const result = await worker.recognize(file);
    await worker.terminate();
    return parseTextLinesToItems(result.data.text);
  };

  const handleCompraFile = async (file: File | undefined, origen: OrigenCompra) => {
    if (!file) return;
    setIsProcesandoCompra(true);
    setCompraError('');
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let parsedItems: Partial<CompraItemDraft>[] = [];

      if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
        parsedItems = await readExcelFile(file);
      } else if (extension === 'pdf') {
        parsedItems = await readPdfFile(file);
      } else if (file.type.startsWith('image/')) {
        parsedItems = await readImageFile(file);
      } else {
        setCompraError('Formato no soportado. Usá Excel, CSV, PDF o una foto.');
        return;
      }

      appendParsedItems(parsedItems, origen, file.name);
    } catch (error) {
      console.error(error);
      setCompraError('No pude leer el comprobante. Podés cargar o corregir los productos manualmente.');
      setCompraPaso('revision');
    } finally {
      setIsProcesandoCompra(false);
    }
  };

  const saveItem = () => {
    if (!editItem?.nombre) return;
    const proveedor = getProveedor(editItem.proveedor_id);
    if (editId) {
      const current = ingredientes.find(i => i.id === editId);
      const nextStock = editItem.stock_actual ?? current?.stock_actual ?? 0;

      setIngredientes(prev => prev.map(i =>
        i.id === editId
          ? { ...i, ...editItem, proveedor_id: editItem.proveedor_id || undefined, proveedor } as Ingrediente
          : i
      ));
      if (current && nextStock !== current.stock_actual) {
        const diferencia = nextStock - current.stock_actual;
        setMovimientos(prev => [{
          id: `mov-${Date.now()}`,
          ingrediente_id: current.id,
          tipo: diferencia > 0 ? 'entrada' : 'salida',
          cantidad: Math.abs(diferencia),
          motivo: diferencia > 0 ? 'Ajuste de ingreso manual' : 'Ajuste de egreso manual',
          stock_anterior: current.stock_actual,
          stock_nuevo: nextStock,
          created_at: new Date().toISOString(),
          ingrediente: { ...current, ...editItem, proveedor_id: editItem.proveedor_id || undefined, proveedor } as Ingrediente,
        }, ...prev]);
      }
    } else {
      const newIng: Ingrediente = {
        id: `ing-${Date.now()}`,
        nombre: editItem.nombre || '',
        unidad_medida: editItem.unidad_medida || 'unidad',
        stock_actual: editItem.stock_actual || 0,
        stock_minimo: editItem.stock_minimo || 0,
        costo_por_unidad: editItem.costo_por_unidad || 0,
        proveedor_id: editItem.proveedor_id || undefined,
        proveedor,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setIngredientes(prev => [...prev, newIng]);
      if (newIng.stock_actual > 0) {
        setMovimientos(prev => [{
          id: `mov-${Date.now()}`,
          ingrediente_id: newIng.id,
          tipo: 'entrada',
          cantidad: newIng.stock_actual,
          motivo: 'Alta de insumo',
          stock_anterior: 0,
          stock_nuevo: newIng.stock_actual,
          created_at: new Date().toISOString(),
          ingrediente: newIng,
        }, ...prev]);
      }
    }
    setShowForm(false);
  };

  const registrarCompra = () => {
    const validItems = compraDraft.items.filter(item => item.nombre.trim() && item.cantidad > 0);
    if (!validItems.length || compraTieneErrores) return;

    const now = new Date().toISOString();
    const compraId = compraDraft.id;
    const movimientosCompra: MovimientoStock[] = [];

    setIngredientes(prev => {
      let nextIngredientes = [...prev];

      validItems.forEach((item, index) => {
        if (item.modo === 'existente' && item.ingrediente_id) {
          const ingrediente = nextIngredientes.find(i => i.id === item.ingrediente_id);
          if (!ingrediente) return;

          const stockNuevo = ingrediente.stock_actual + item.cantidad;
          const updated: Ingrediente = {
            ...ingrediente,
            stock_actual: stockNuevo,
            costo_por_unidad: item.costo_unitario > 0 ? item.costo_unitario : ingrediente.costo_por_unidad,
            proveedor_id: item.proveedor_id || ingrediente.proveedor_id,
            updated_at: now,
          };

          nextIngredientes = nextIngredientes.map(i => i.id === ingrediente.id ? updated : i);
          movimientosCompra.push({
            id: `mov-${Date.now()}-${index}`,
            ingrediente_id: ingrediente.id,
            tipo: 'entrada',
            cantidad: item.cantidad,
            motivo: `Compra registrada${compraDraft.comprobante_nombre ? ` (${compraDraft.comprobante_nombre})` : ''}`,
            compra_id: compraId,
            stock_anterior: ingrediente.stock_actual,
            stock_nuevo: stockNuevo,
            created_at: now,
            ingrediente: updated,
          });
        } else {
          const proveedor = getProveedor(item.proveedor_id || compraDraft.proveedor_id);
          const newIng: Ingrediente = {
            id: createId('ing'),
            nombre: item.nombre.trim(),
            unidad_medida: item.unidad_medida,
            stock_actual: item.cantidad,
            stock_minimo: item.stock_minimo || 0,
            costo_por_unidad: item.costo_unitario,
            proveedor_id: item.proveedor_id || compraDraft.proveedor_id,
            proveedor,
            activo: true,
            created_at: now,
            updated_at: now,
          };

          nextIngredientes = [...nextIngredientes, newIng];
          movimientosCompra.push({
            id: `mov-${Date.now()}-${index}`,
            ingrediente_id: newIng.id,
            tipo: 'entrada',
            cantidad: item.cantidad,
            motivo: `Alta por compra${compraDraft.comprobante_nombre ? ` (${compraDraft.comprobante_nombre})` : ''}`,
            compra_id: compraId,
            stock_anterior: 0,
            stock_nuevo: item.cantidad,
            created_at: now,
            ingrediente: newIng,
          });
        }
      });

      return nextIngredientes;
    });

    setMovimientos(prev => [...movimientosCompra, ...prev]);

    if (compraProveedorId && compraTotal > 0) {
      const factura = crearFacturaProveedor({
        proveedor_id: compraProveedorId,
        compra_id: compraId,
        numero: compraDraft.comprobante_nombre,
        fecha: compraDraft.fecha,
        vencimiento: compraDraft.vencimiento || compraDraft.fecha,
        total: compraTotal,
        observaciones: compraDraft.observaciones || 'Factura creada desde compra de stock',
      });

      if (montoPagadoCompra > 0 && compraDraft.cuenta_origen_id) {
        registrarPagoProveedor({
          proveedor_id: compraProveedorId,
          factura_id: factura.id,
          cuenta_origen_id: compraDraft.cuenta_origen_id,
          fecha: compraDraft.fecha,
          metodo_pago: metodoPagoCompra,
          monto: montoPagadoCompra,
          observaciones: `Pago ${compraDraft.condicion_pago === 'pagada' ? 'total' : 'parcial'} de compra ${factura.numero}`,
        });
      }
    }

    setCompraDraft(emptyCompraDraft());
    setCompraPaso('carga');
    setCompraError('');
    setShowCompra(false);
  };

  const resetConsumoForm = () => {
    setConsumoIngId('');
    setConsumoCantidad('');
    setConsumoMotivo(motivosConsumo[0]);
    setConsumoResponsable('');
    setConsumoFecha(new Date().toISOString().slice(0, 10));
    setConsumoObservaciones('');
  };

  const registrarConsumoInterno = () => {
    const ingrediente = ingredientes.find(item => item.id === consumoIngId);
    const cantidad = parseFloat(consumoCantidad);
    if (!ingrediente || !cantidad || cantidad <= 0) return;

    const stockNuevo = Math.max(ingrediente.stock_actual - cantidad, 0);
    const updated: Ingrediente = {
      ...ingrediente,
      stock_actual: stockNuevo,
      updated_at: new Date().toISOString(),
    };
    const detalle = [
      consumoMotivo,
      consumoResponsable.trim() ? `Responsable: ${consumoResponsable.trim()}` : '',
      consumoObservaciones.trim(),
    ].filter(Boolean).join(' - ');

    setIngredientes(prev => prev.map(item => item.id === ingrediente.id ? updated : item));
    setMovimientos(prev => [{
      id: createId('mov-consumo'),
      ingrediente_id: ingrediente.id,
      tipo: 'salida',
      cantidad,
      motivo: detalle,
      stock_anterior: ingrediente.stock_actual,
      stock_nuevo: stockNuevo,
      created_at: new Date(`${consumoFecha}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
      ingrediente: updated,
    }, ...prev]);

    resetConsumoForm();
    setShowConsumoForm(false);
  };

  const resetProduccionForm = () => {
    setProduccionId('');
    setProduccionCantidad('');
    setProduccionFecha(new Date().toISOString().slice(0, 10));
    setProduccionResponsable('');
    setProduccionObservaciones('');
    setCantidadesUsadas({});
  };

  const openProduccionForm = (produccion?: ProduccionPreparada) => {
    setProduccionId(produccion?.id || producciones.find(item => item.activo)?.id || '');
    setProduccionCantidad(produccion ? String(produccion.cantidad_producida) : '');
    setProduccionFecha(new Date().toISOString().slice(0, 10));
    setProduccionResponsable('');
    setProduccionObservaciones('');
    const base = produccion || producciones.find(item => item.activo);
    setCantidadesUsadas(Object.fromEntries((base?.receta || []).map(item => [item.id, String(item.cantidad)])));
    setShowProduccionForm(true);
  };

  const openDefinicionProduccion = (produccion?: ProduccionPreparada) => {
    setDefinicionError('');
    setDefinicionEditId(produccion?.id || null);
    setDefinicionNombre(produccion?.nombre || '');
    setDefinicionDescripcion(produccion?.descripcion || '');
    setDefinicionUnidad(produccion?.unidad_medida || 'unidad');
    setDefinicionRendimiento(produccion ? String(produccion.cantidad_producida) : '');
    setDefinicionReceta((produccion?.receta || []).map(item => ({
      id: item.id,
      ingrediente_id: item.ingrediente_id || ingredientes[0]?.id || '',
      cantidad: String(item.cantidad),
    })));
    setShowDefinicionProduccion(true);
  };

  const guardarDefinicionProduccion = () => {
    const rendimiento = parseFloat(definicionRendimiento) || 0;
    const recetaValida = definicionReceta.filter(item => item.ingrediente_id && (parseFloat(item.cantidad) || 0) > 0);
    if (!definicionNombre.trim()) {
      setDefinicionError('Ingresá un nombre para la elaboración.');
      return;
    }
    if (rendimiento <= 0) {
      setDefinicionError('Ingresá un rendimiento esperado mayor que cero.');
      return;
    }
    if (definicionReceta.length === 0) {
      setDefinicionError('Agregá por lo menos un insumo a la receta.');
      return;
    }
    if (recetaValida.length !== definicionReceta.length) {
      setDefinicionError('Completá la cantidad utilizada de cada insumo. Todas deben ser mayores que cero.');
      return;
    }
    setDefinicionError('');
    const now = new Date().toISOString();
    const id = definicionEditId || createId('prep');
    const receta = recetaValida.map(item => {
      const ingrediente = ingredientes.find(ing => ing.id === item.ingrediente_id);
      const cantidad = parseFloat(item.cantidad) || 0;
      return {
        id: item.id || createId('prep-rec'), producto_id: id, tipo: 'stock' as const,
        ingrediente_id: item.ingrediente_id, cantidad,
        unidad_medida: ingrediente?.unidad_medida || 'unidad',
        costo_calculado: cantidad * (ingrediente?.costo_por_unidad || 0), created_at: now, ingrediente,
      };
    });
    const costoLote = receta.reduce((sum, item) => sum + item.costo_calculado, 0);
    setProducciones(prev => {
      const existente = prev.find(item => item.id === id);
      const guardada: ProduccionPreparada = {
        id, nombre: definicionNombre.trim(), descripcion: definicionDescripcion.trim(),
        unidad_medida: definicionUnidad, cantidad_producida: rendimiento,
        stock_actual: existente?.stock_actual || 0, costo_unitario: costoLote / rendimiento,
        receta, activo: existente?.activo ?? true,
        created_at: existente?.created_at || now, updated_at: now,
      };
      return existente ? prev.map(item => item.id === id ? guardada : item) : [guardada, ...prev];
    });
    setShowDefinicionProduccion(false);
  };

  const registrarProduccion = () => {
    if (!selectedProduccion || produccionCantidadNum <= 0 || produccionTieneFaltantes) return;

    const now = new Date().toISOString();
    const registroId = createId('prod-reg');
    const movimientosProduccion: MovimientoStock[] = insumosProduccion
      .filter(item => item.ingrediente)
      .map((item, index) => {
        const ingrediente = item.ingrediente as Ingrediente;
        return {
          id: `${registroId}-mov-${index}`,
          ingrediente_id: ingrediente.id,
          tipo: 'salida',
          cantidad: item.requerido,
          motivo: `Produccion: ${selectedProduccion.nombre}`,
          stock_anterior: ingrediente.stock_actual,
          stock_nuevo: ingrediente.stock_actual - item.requerido,
          created_at: now,
          ingrediente: {
            ...ingrediente,
            stock_actual: ingrediente.stock_actual - item.requerido,
            updated_at: now,
          },
        };
      });

    setIngredientes(prev => prev.map(ingrediente => {
      const consumo = insumosProduccion.find(item => item.ingrediente?.id === ingrediente.id);
      if (!consumo) return ingrediente;
      return {
        ...ingrediente,
        stock_actual: ingrediente.stock_actual - consumo.requerido,
        updated_at: now,
      };
    }));

    setProducciones(prev => prev.map(item => (
      item.id === selectedProduccion.id
        ? {
            ...item,
            stock_actual: item.stock_actual + produccionCantidadNum,
            costo_unitario: produccionCantidadNum > 0 ? costoProduccionTotal / produccionCantidadNum : item.costo_unitario,
            updated_at: now,
          }
        : item
    )));

    setMovimientos(prev => [...movimientosProduccion, ...prev]);
    setRegistrosProduccion(prev => [
      {
        id: registroId,
        produccion_id: selectedProduccion.id,
        fecha: produccionFecha,
        cantidad: produccionCantidadNum,
        cantidad_base: selectedProduccion.cantidad_producida,
        costo_total: costoProduccionTotal,
        insumos_utilizados: insumosProduccion.filter(item => item.ingrediente).map(item => ({
          ingrediente_id: item.ingrediente!.id,
          cantidad: item.requerido,
          costo: item.costo,
        })),
        responsable: produccionResponsable.trim() || undefined,
        observaciones: produccionObservaciones.trim() || undefined,
        created_at: now,
      },
      ...prev,
    ]);

    resetProduccionForm();
    setShowProduccionForm(false);
  };

  if (apartadoInicial === 'consumos') {
    const consumos = movimientos
      .filter(mov => mov.tipo === 'salida')
      .filter(mov => filtroConsumoIngId === 'todos' || mov.ingrediente_id === filtroConsumoIngId)
      .filter(mov => filtroConsumoMotivo === 'todos' || mov.motivo.toLowerCase().includes(filtroConsumoMotivo.toLowerCase()))
      .filter(mov => !filtroConsumoDesde || mov.created_at.slice(0, 10) >= filtroConsumoDesde)
      .filter(mov => !filtroConsumoHasta || mov.created_at.slice(0, 10) <= filtroConsumoHasta)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const totalCostoConsumos = consumos.reduce((sum, mov) => {
      const costo = mov.ingrediente?.costo_por_unidad || ingredientes.find(item => item.id === mov.ingrediente_id)?.costo_por_unidad || 0;
      return sum + mov.cantidad * costo;
    }, 0);

    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Consumos internos</h2>
            <p className="text-sm text-slate-500">Registrá mermas, uso interno, invitaciones o consumo del personal.</p>
          </div>
          <button
            onClick={() => setShowConsumoForm(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} />
            Registrar consumo
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <p className="text-xs text-red-600 mb-1">Consumos registrados</p>
            <p className="text-2xl font-bold text-red-700">{consumos.length}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-xs text-amber-600 mb-1">Cantidad consumida</p>
            <p className="text-2xl font-bold text-amber-700">
              {consumos.reduce((sum, mov) => sum + mov.cantidad, 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Costo consumido</p>
            <p className="text-2xl font-bold text-slate-800">${totalCostoConsumos.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Último movimiento</p>
            <p className="text-sm font-semibold text-slate-800">
              {consumos[0] ? new Date(consumos[0].created_at).toLocaleDateString('es-AR') : 'Sin consumos'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 bg-white rounded-2xl border border-slate-200 p-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Insumo</label>
            <select
              value={filtroConsumoIngId}
              onChange={e => setFiltroConsumoIngId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
            >
              <option value="todos">Todos</option>
              {ingredientes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Motivo</label>
            <select
              value={filtroConsumoMotivo}
              onChange={e => setFiltroConsumoMotivo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
            >
              <option value="todos">Todos</option>
              {motivosConsumo.map(motivo => <option key={motivo} value={motivo}>{motivo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Desde</label>
            <input
              type="date"
              value={filtroConsumoDesde}
              onChange={e => setFiltroConsumoDesde(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Hasta</label>
            <input
              type="date"
              value={filtroConsumoHasta}
              onChange={e => setFiltroConsumoHasta(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Insumo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Motivo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Costo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Stock nuevo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {consumos.map(mov => {
                const ingrediente = mov.ingrediente || ingredientes.find(item => item.id === mov.ingrediente_id);
                const costo = (ingrediente?.costo_por_unidad || 0) * mov.cantidad;
                const status = ingrediente ? getStockStatus(ingrediente) : null;

                return (
                  <tr key={mov.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-800">{ingrediente?.nombre || 'Insumo'}</p>
                      {status && (
                        <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">{mov.motivo}</td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-red-600">-{mov.cantidad.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-slate-700">${costo.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-600">{mov.stock_nuevo.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-500">
                      {new Date(mov.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                );
              })}
              {consumos.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    Todavía no hay consumos internos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showConsumoForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800">Registrar consumo interno</h3>
                  <p className="text-sm text-slate-500">Descuenta stock y deja registrado el costo del consumo.</p>
                </div>
                <button onClick={() => setShowConsumoForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Insumo *</label>
                    <select
                      value={consumoIngId}
                      onChange={e => setConsumoIngId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                    >
                      <option value="">Seleccionar...</option>
                      {ingredientes.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.nombre} - stock {item.stock_actual.toLocaleString()} {item.unidad_medida}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Motivo *</label>
                    <select
                      value={consumoMotivo}
                      onChange={e => setConsumoMotivo(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                    >
                      {motivosConsumo.map(motivo => <option key={motivo} value={motivo}>{motivo}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cantidad *</label>
                    <input
                      type="number"
                      value={consumoCantidad}
                      onChange={e => setConsumoCantidad(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                      min="0"
                    />
                    {consumoIngrediente && (
                      <p className="text-xs text-slate-400 mt-1">{consumoIngrediente.unidad_medida}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                    <input
                      type="date"
                      value={consumoFecha}
                      onChange={e => setConsumoFecha(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Responsable</label>
                    <input
                      value={consumoResponsable}
                      onChange={e => setConsumoResponsable(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                      placeholder="Nombre"
                    />
                  </div>
                </div>

                {consumoIngrediente && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Stock actual</p>
                      <p className="text-lg font-bold text-slate-800">{consumoIngrediente.stock_actual.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <p className="text-xs text-red-600">Stock nuevo</p>
                      <p className="text-lg font-bold text-red-700">
                        {Math.max(consumoIngrediente.stock_actual - consumoCantidadNum, 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs text-amber-600">Costo estimado</p>
                      <p className="text-lg font-bold text-amber-700">${consumoCostoTotal.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {consumoIngrediente && consumoCantidadNum > consumoIngrediente.stock_actual && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                    La cantidad supera el stock actual. El stock va a quedar en cero.
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                  <textarea
                    value={consumoObservaciones}
                    onChange={e => setConsumoObservaciones(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                    rows={3}
                    placeholder="Detalle opcional: turno, causa, autorizacion, mesa relacionada..."
                  />
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t border-slate-100">
                <button
                  onClick={() => setShowConsumoForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={registrarConsumoInterno}
                  disabled={!consumoIngId || !consumoCantidadNum}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  Guardar consumo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (apartadoInicial === 'produccion') {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Producción</h2>
            <p className="text-sm text-slate-500">Prepará semi-elaborados que después se usan en combos, como milanesas o medallones.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openDefinicionProduccion()} className="flex items-center gap-2 border border-amber-300 text-amber-700 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-amber-50">
              <Plus size={16} /> Nueva elaboración
            </button>
            <button onClick={() => openProduccionForm()} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              <Plus size={16} /> Registrar producción
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-600 mb-1">Producciones activas</p>
            <p className="text-2xl font-bold text-blue-700">{producciones.filter(p => p.activo).length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs text-emerald-600 mb-1">Unidades producidas</p>
            <p className="text-2xl font-bold text-emerald-700">{producciones.reduce((sum, item) => sum + item.stock_actual, 0).toLocaleString()}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-xs text-amber-600 mb-1">Insumos críticos</p>
            <p className="text-2xl font-bold text-amber-700">{stockBajo.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Producción</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Receta base</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Costo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Stock producido</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {producciones.map(produccion => (
                <tr key={produccion.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold text-slate-800">{produccion.nombre}</p>
                    <p className="text-xs text-slate-400 truncate max-w-72">{produccion.descripcion}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {produccion.receta.length} insumos de stock
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-slate-600">${produccion.costo_unitario.toLocaleString()} / {produccion.unidad_medida}</td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-slate-800">{produccion.stock_actual.toLocaleString()} {produccion.unidad_medida}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-600">
                      {produccion.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex justify-center gap-3">
                      <button onClick={() => openDefinicionProduccion(produccion)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Editar</button>
                      <button onClick={() => openProduccionForm(produccion)} className="text-xs font-semibold text-amber-600 hover:text-amber-700">Producir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Últimas producciones</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Producción</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Costo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {registrosProduccion.slice(0, 6).map(registro => {
                const produccion = producciones.find(item => item.id === registro.produccion_id);
                return (
                  <tr key={registro.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {new Date(`${registro.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-800">{produccion?.nombre || 'Producción'}</p>
                      {registro.observaciones && <p className="text-xs text-slate-400">{registro.observaciones}</p>}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-emerald-600">
                      +{registro.cantidad.toLocaleString()} {produccion?.unidad_medida || ''}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-slate-600">${registro.costo_total.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-slate-500">{registro.responsable || '-'}</td>
                  </tr>
                );
              })}
              {registrosProduccion.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                    Todavía no hay producciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showDefinicionProduccion && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800">{definicionEditId ? 'Editar elaboración' : 'Nueva elaboración'}</h3>
                  <p className="text-sm text-slate-500">Definí el nombre, el rendimiento esperado y los insumos de la receta base.</p>
                </div>
                <button onClick={() => setShowDefinicionProduccion(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label><input value={definicionNombre} onChange={e => setDefinicionNombre(e.target.value)} placeholder="Ej: Milanesas preparadas" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción</label><input value={definicionDescripcion} onChange={e => setDefinicionDescripcion(e.target.value)} placeholder="Qué se obtiene" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Rendimiento esperado *</label><input type="number" min="0" step="0.001" value={definicionRendimiento} onChange={e => setDefinicionRendimiento(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400" /></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Unidad obtenida</label><select value={definicionUnidad} onChange={e => setDefinicionUnidad(e.target.value as UnidadMedida)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">{unidades.map(unidad => <option key={unidad} value={unidad}>{unidad}</option>)}</select></div>
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100"><div><p className="text-sm font-semibold text-slate-700">Receta base</p><p className="text-xs text-slate-400">Elegí cada insumo y escribí cuánto utilizás para obtener el rendimiento indicado.</p></div><button onClick={() => { setDefinicionError(''); setDefinicionReceta(prev => [...prev, { id: createId('prep-rec'), ingrediente_id: ingredientes[0]?.id || '', cantidad: '' }]); }} className="text-xs font-semibold text-amber-600 flex items-center gap-1"><Plus size={14} /> Agregar insumo</button></div>
                  <div className="divide-y divide-slate-100">
                    {definicionReceta.map(item => { const ingrediente = ingredientes.find(ing => ing.id === item.ingrediente_id); return (
                      <div key={item.id} className="grid grid-cols-[1fr_180px_36px] gap-3 items-center p-3">
                        <select value={item.ingrediente_id} onChange={e => setDefinicionReceta(prev => prev.map(row => row.id === item.id ? { ...row, ingrediente_id: e.target.value } : row))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">{ingredientes.filter(ing => ing.activo).map(ing => <option key={ing.id} value={ing.id}>{ing.nombre}</option>)}</select>
                        <div className="flex items-center gap-2"><input aria-label={`Cantidad de ${ingrediente?.nombre || 'insumo'}`} type="number" min="0" step="0.001" placeholder="Cantidad" value={item.cantidad} onChange={e => { setDefinicionError(''); setDefinicionReceta(prev => prev.map(row => row.id === item.id ? { ...row, cantidad: e.target.value } : row)); }} className={`w-full border rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400 ${definicionError && !(parseFloat(item.cantidad) > 0) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} /><span className="text-xs text-slate-500 w-16">{ingrediente?.unidad_medida}</span></div>
                        <button onClick={() => setDefinicionReceta(prev => prev.filter(row => row.id !== item.id))} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>); })}
                    {definicionReceta.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Agregá por lo menos un insumo.</p>}
                  </div>
                </div>
                {definicionError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> {definicionError}</div>}
              </div>
              <div className="flex gap-3 p-6 border-t border-slate-100"><button onClick={() => setShowDefinicionProduccion(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium">Cancelar</button><button onClick={guardarDefinicionProduccion} disabled={!definicionNombre.trim() || !(parseFloat(definicionRendimiento) > 0) || definicionReceta.length === 0} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"><Check size={16} /> Guardar elaboración</button></div>
            </div>
          </div>
        )}

        {showProduccionForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800">Registrar producción</h3>
                  <p className="text-sm text-slate-500">Descuenta los insumos de la receta y suma stock producido.</p>
                </div>
                <button onClick={() => setShowProduccionForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Producción *</label>
                    <select
                      value={produccionId}
                      onChange={e => {
                        const nextId = e.target.value;
                        const nextProduccion = producciones.find(item => item.id === nextId);
                        setProduccionId(nextId);
                        setProduccionCantidad(nextProduccion ? String(nextProduccion.cantidad_producida) : '');
                        setCantidadesUsadas(Object.fromEntries((nextProduccion?.receta || []).map(item => [item.id, String(item.cantidad)])));
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                    >
                      <option value="">Seleccionar...</option>
                      {producciones.filter(item => item.activo).map(item => (
                        <option key={item.id} value={item.id}>
                          {item.nombre} - lote base {item.cantidad_producida} {item.unidad_medida}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cantidad obtenida al finalizar *</label>
                    <input
                      type="number"
                      value={produccionCantidad}
                      onChange={e => setProduccionCantidad(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                      min="0"
                    />
                    {selectedProduccion && (
                      <p className="text-xs text-slate-400 mt-1">{selectedProduccion.unidad_medida} · rendimiento esperado {selectedProduccion.cantidad_producida}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                    <input
                      type="date"
                      value={produccionFecha}
                      onChange={e => setProduccionFecha(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Responsable</label>
                    <input
                      value={produccionResponsable}
                      onChange={e => setProduccionResponsable(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                      placeholder="Nombre"
                    />
                  </div>
                </div>

                {selectedProduccion && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Stock actual</p>
                      <p className="text-lg font-bold text-slate-800">
                        {selectedProduccion.stock_actual.toLocaleString()} {selectedProduccion.unidad_medida}
                      </p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <p className="text-xs text-emerald-600">Stock después</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {(selectedProduccion.stock_actual + produccionCantidadNum).toLocaleString()} {selectedProduccion.unidad_medida}
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs text-amber-600">Costo estimado</p>
                      <p className="text-lg font-bold text-amber-700">${costoProduccionTotal.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {selectedProduccion && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Insumo</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Usado real</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Disponible</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Después</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {insumosProduccion.map(({ ingrediente, requerido, suficiente, costo }, index) => (
                          <tr key={`${ingrediente?.id || index}-${index}`}>
                            <td className="py-3 px-4">
                              <p className="text-sm font-medium text-slate-800">{ingrediente?.nombre || 'Insumo no encontrado'}</p>
                              <p className="text-xs text-slate-400">Costo ${costo.toLocaleString()}</p>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <input type="number" min="0" step="0.001" value={cantidadesUsadas[insumosProduccion[index].item.id] ?? requerido}
                                  onChange={e => setCantidadesUsadas(prev => ({ ...prev, [insumosProduccion[index].item.id]: e.target.value }))}
                                  className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:border-amber-400" />
                                <span className="text-xs text-slate-500 w-16">{ingrediente?.unidad_medida || ''}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right text-sm text-slate-600">
                              {(ingrediente?.stock_actual || 0).toLocaleString()}
                            </td>
                            <td className={`py-3 px-4 text-right text-sm font-semibold ${suficiente ? 'text-slate-800' : 'text-red-600'}`}>
                              {ingrediente ? (ingrediente.stock_actual - requerido).toLocaleString() : 'Falta'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedProduccion && produccionTieneFaltantes && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                    No se puede registrar porque faltan insumos para esta cantidad.
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                  <textarea
                    value={produccionObservaciones}
                    onChange={e => setProduccionObservaciones(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                    rows={3}
                    placeholder="Turno, lote, merma, notas de cocina..."
                  />
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t border-slate-100">
                <button
                  onClick={() => setShowProduccionForm(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={registrarProduccion}
                  disabled={!selectedProduccion || !produccionCantidadNum || produccionTieneFaltantes}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  Confirmar producción
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setShowStockCritico(true)}
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="text-red-500" size={20} />
          <div>
            <p className="text-xl font-bold text-red-700">{stockBajo.length}</p>
            <p className="text-xs text-red-600">Stock crítico</p>
          </div>
        </button>
        <button
          onClick={() => setShowStockBajo(true)}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors"
        >
          <TrendingDown className="text-amber-500" size={20} />
          <div>
            <p className="text-xl font-bold text-amber-700">{todosStockBajo.length}</p>
            <p className="text-xs text-amber-600">Stock bajo</p>
          </div>
        </button>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <Package className="text-emerald-500" size={20} />
          <div>
            <p className="text-xl font-bold text-emerald-700">{stockOk.length}</p>
            <p className="text-xs text-emerald-600">Stock normal</p>
          </div>
        </div>
        <button
          onClick={() => setShowCompraNecesaria(true)}
          className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-blue-100 transition-colors"
        >
          <Plus className="text-blue-500" size={20} />
          <div>
            <p className="text-xl font-bold text-blue-700">{compraNecesaria.length}</p>
            <p className="text-xs text-blue-600">Compra necesaria de productos</p>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Insumos y Materias Primas</h2>
        <div className="flex gap-2">
          <button
            onClick={descargarExcelStock}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Download size={14} />
            Descargar Excel
          </button>
          <button
            onClick={() => openCompra()}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} />
            Registrar Compra
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} />
            Nuevo Insumo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Insumo</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidad</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Actual</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Mín.</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo/Unidad</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Proveedor</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barra</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ingredientes.map(ing => {
                const status = getStockStatus(ing);
                const pct = Math.min(100, Math.round((ing.stock_actual / (ing.stock_minimo * 3)) * 100));
                return (
                  <tr key={ing.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
                        <span className="font-medium text-slate-800 text-sm">{ing.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-500 capitalize">{ing.unidad_medida}</td>
                    <td className="py-3 px-4 text-right font-semibold text-sm">
                      <span className={ing.stock_actual <= ing.stock_minimo ? 'text-red-600' : 'text-slate-800'}>
                        {ing.stock_actual.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-slate-500">{ing.stock_minimo.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-600">${ing.costo_por_unidad.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{getProveedorNombre(ing)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct < 34 ? 'bg-red-500' : pct < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedIngId(ing.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                          title="Ver ingresos y egresos"
                        >
                          <Package size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(ing)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                          title="Editar insumo"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editId ? 'Editar Insumo' : 'Nuevo Insumo'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <input
                  value={editItem.nombre || ''}
                  onChange={e => setEditItem(i => ({ ...i, nombre: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="Nombre del insumo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidad de medida</label>
                  <select
                    value={editItem.unidad_medida || 'unidad'}
                    onChange={e => setEditItem(i => ({ ...i, unidad_medida: e.target.value as UnidadMedida }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Costo por unidad $</label>
                  <input
                    type="number"
                    value={editItem.costo_por_unidad || ''}
                    onChange={e => setEditItem(i => ({ ...i, costo_por_unidad: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0" step="0.001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock actual</label>
                  <input
                    type="number"
                    value={editItem.stock_actual || ''}
                    onChange={e => setEditItem(i => ({ ...i, stock_actual: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock mínimo</label>
                  <input
                    type="number"
                    value={editItem.stock_minimo || ''}
                    onChange={e => setEditItem(i => ({ ...i, stock_minimo: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Proveedor</label>
                <select
                  value={editItem.proveedor_id || ''}
                  onChange={e => setEditItem(i => ({ ...i, proveedor_id: e.target.value || undefined }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  <option value="">Sin proveedor</option>
                  {loadProveedores().map(proveedor => (
                    <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={saveItem} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2">
                <Check size={16} />Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompra && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Registrar compra</h3>
                <p className="text-sm text-slate-500">
                  Cargá un Excel, PDF, foto de factura o agregá productos manualmente. Revisá todo antes de sumar stock.
                </p>
              </div>
              <button onClick={() => setShowCompra(false)}><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => {
                    setCompraDraft(prev => ({ ...prev, origen: 'manual' }));
                    addCompraItem();
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    compraDraft.origen === 'manual' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Plus size={18} className="text-amber-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Manual</p>
                  <p className="text-xs text-slate-500">Agregar productos uno por uno.</p>
                </button>

                <label className={`rounded-xl border p-4 text-left cursor-pointer transition-colors ${
                  compraDraft.origen === 'excel' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <Upload size={18} className="text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Excel o CSV</p>
                  <p className="text-xs text-slate-500">Leer planillas de proveedores.</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => handleCompraFile(e.target.files?.[0], 'excel')}
                  />
                </label>

                <label className={`rounded-xl border p-4 text-left cursor-pointer transition-colors ${
                  compraDraft.origen === 'pdf' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <FileText size={18} className="text-blue-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">PDF o factura</p>
                  <p className="text-xs text-slate-500">Extraer texto del comprobante.</p>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => handleCompraFile(e.target.files?.[0], 'pdf')}
                  />
                </label>

                <label className={`rounded-xl border p-4 text-left cursor-pointer transition-colors ${
                  compraDraft.origen === 'foto' ? 'border-purple-300 bg-purple-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <Camera size={18} className="text-purple-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Foto con celular</p>
                  <p className="text-xs text-slate-500">Abrir cámara y leer ticket.</p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => handleCompraFile(e.target.files?.[0], 'foto')}
                  />
                </label>
              </div>

              <div className="grid grid-cols-4 gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Proveedor de la compra</label>
                <select
                    value={compraDraft.proveedor_id || ''}
                    onChange={e => setCompraDraft(prev => ({ ...prev, proveedor_id: e.target.value || undefined }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                    <option value="">Sin proveedor</option>
                    {loadProveedores().map(proveedor => (
                      <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                    ))}
                </select>
              </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha</label>
                <input
                    type="date"
                    value={compraDraft.fecha}
                    onChange={e => setCompraDraft(prev => ({ ...prev, fecha: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                />
              </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Comprobante</label>
                <input
                    value={compraDraft.comprobante_nombre || ''}
                    onChange={e => setCompraDraft(prev => ({ ...prev, comprobante_nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                    placeholder="Factura, ticket o archivo"
                />
              </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total estimado</label>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800">
                    ${(compraDraft.total || compraTotal).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div>
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Estado del pago</label>
                  <select
                    value={compraDraft.condicion_pago || 'pendiente'}
                    onChange={e => {
                      const condicion = e.target.value as CondicionPagoCompra;
                      setCompraDraft(prev => ({
                        ...prev,
                        condicion_pago: condicion,
                        monto_pagado: condicion === 'pagada' ? compraTotal : condicion === 'pendiente' ? 0 : prev.monto_pagado,
                      }));
                    }}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
                  >
                    <option value="pendiente">Queda deuda</option>
                    <option value="pagada">Pagada ahora</option>
                    <option value="parcial">Pago parcial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Vencimiento</label>
                  <input
                    type="date"
                    value={compraDraft.vencimiento || compraDraft.fecha}
                    onChange={e => setCompraDraft(prev => ({ ...prev, vencimiento: e.target.value }))}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Sale de cuenta</label>
                  <select
                    value={compraDraft.cuenta_origen_id || ''}
                    onChange={e => setCompraDraft(prev => ({ ...prev, cuenta_origen_id: e.target.value || undefined }))}
                    disabled={(compraDraft.condicion_pago || 'pendiente') === 'pendiente'}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {cuentasDinero.filter(cuenta => cuenta.activa).map(cuenta => (
                      <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Monto pagado</label>
                  <input
                    type="number"
                    value={(compraDraft.condicion_pago || 'pendiente') === 'pagada' ? compraTotal : compraDraft.monto_pagado || ''}
                    onChange={e => setCompraDraft(prev => ({ ...prev, monto_pagado: parseFloat(e.target.value) || 0 }))}
                    disabled={(compraDraft.condicion_pago || 'pendiente') !== 'parcial'}
                    className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-emerald-400 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                    min="0"
                  />
                </div>
                {(compraDraft.condicion_pago || 'pendiente') !== 'pendiente' && (
                  <div className="col-span-4">
                    <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Metodo de pago</label>
                    <select
                      value={metodoPagoCompra}
                      onChange={e => setMetodoPagoCompra(e.target.value as MetodoPago)}
                      className="w-full max-w-xs border border-emerald-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="debito">Debito</option>
                      <option value="credito">Credito</option>
                    </select>
                  </div>
                )}
              </div>

              {isProcesandoCompra && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
                  <Loader2 size={16} className="animate-spin" />
                  Leyendo comprobante. Cuando termine vas a poder revisar cada producto.
                </div>
              )}

              {compraError && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-700">
                  {compraError}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800">Revisión de productos</h4>
                  <p className="text-xs text-slate-500">Elegí si cada producto suma stock a un insumo existente o crea uno nuevo.</p>
                </div>
                <button
                  onClick={() => addCompraItem()}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={14} /> Agregar línea
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Destino</th>
                      <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Producto leído</th>
                      <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Unidad</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Costo unit.</th>
                      <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Proveedor</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase">Subtotal</th>
                      <th className="py-3 px-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compraDraft.items.map(item => (
                      <tr key={item.id} className={item.modo === 'nuevo' ? 'bg-amber-50/40' : 'bg-white'}>
                        <td className="py-3 px-3 align-top">
                          <select
                            value={item.modo === 'nuevo' ? 'nuevo' : item.ingrediente_id || ''}
                            onChange={e => {
                              const value = e.target.value;
                              updateCompraItem(item.id, value === 'nuevo' ? { modo: 'nuevo' } : { modo: 'existente', ingrediente_id: value });
                            }}
                            className="w-48 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                          >
                            <option value="">Elegir insumo...</option>
                            {ingredientes.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                            <option value="nuevo">Crear insumo nuevo</option>
                          </select>
                          <p className={`mt-1 text-[11px] font-medium ${item.modo === 'nuevo' ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {item.modo === 'nuevo' ? 'Se va a crear' : 'Suma stock existente'}
                          </p>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <input
                            value={item.nombre}
                            onChange={e => updateCompraItem(item.id, { nombre: e.target.value })}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                            placeholder="Nombre del producto"
                          />
                        </td>
                        <td className="py-3 px-3 align-top">
                          <select
                            value={item.unidad_medida}
                            onChange={e => updateCompraItem(item.id, { unidad_medida: e.target.value as UnidadMedida })}
                            disabled={item.modo === 'existente'}
                            className="w-32 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white disabled:bg-slate-50"
                          >
                            {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <input
                            type="number"
                            value={item.cantidad || ''}
                            onChange={e => updateCompraItem(item.id, { cantidad: parseFloat(e.target.value) || 0 })}
                            className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400"
                            min="0"
                          />
                        </td>
                        <td className="py-3 px-3 align-top">
                          <input
                            type="number"
                            value={item.costo_unitario || ''}
                            onChange={e => updateCompraItem(item.id, { costo_unitario: parseFloat(e.target.value) || 0 })}
                            className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400"
                            min="0"
                            step="0.001"
                          />
                        </td>
                        <td className="py-3 px-3 align-top">
                          <select
                            value={item.proveedor_id || compraDraft.proveedor_id || ''}
                            onChange={e => updateCompraItem(item.id, { proveedor_id: e.target.value || undefined })}
                            className="w-40 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                          >
                            <option value="">Sin proveedor</option>
                            {loadProveedores().map(proveedor => (
                              <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-3 align-top text-right text-sm font-semibold text-slate-700">
                          ${(item.cantidad * item.costo_unitario).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 align-top text-right">
                          <button
                            onClick={() => removeCompraItem(item.id)}
                            className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar línea"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {compraDraft.items.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-400">
                    Todavía no hay productos cargados. Subí un archivo, sacá una foto o agregá una línea manual.
                  </div>
                )}
              </div>

              {compraPaso === 'revision' && compraDraft.items.length > 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700">
                  Revisá las coincidencias: las líneas verdes suman stock existente y las amarillas crean insumos nuevos.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-100">
              <div className="text-sm text-slate-500">
                {compraDraft.items.length} productos · Total: <span className="font-bold text-slate-800">${compraTotal.toLocaleString()}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompra(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
                <button
                  onClick={registrarCompra}
                  disabled={!compraDraft.items.length || compraTieneErrores || isProcesandoCompra}
                  className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-400 flex items-center justify-center gap-2"
                >
                  <Check size={16} />Confirmar compra y sumar stock
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedIngrediente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{selectedIngrediente.nombre}</h3>
                <p className="text-sm text-slate-500">
                  Stock actual: {selectedIngrediente.stock_actual.toLocaleString()} {selectedIngrediente.unidad_medida}
                </p>
                <p className="text-sm text-slate-500">Proveedor: {getProveedorNombre(selectedIngrediente)}</p>
              </div>
              <button onClick={() => setSelectedIngId(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 p-6 border-b border-slate-100">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs text-emerald-600 mb-1">Ingresos</p>
                <p className="text-lg font-bold text-emerald-700">
                  {selectedMovimientos.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.cantidad, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-xs text-red-600 mb-1">Egresos</p>
                <p className="text-lg font-bold text-red-700">
                  {selectedMovimientos.filter(m => m.tipo === 'salida').reduce((sum, m) => sum + m.cantidad, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Movimientos</p>
                <p className="text-lg font-bold text-slate-800">{selectedMovimientos.length}</p>
              </div>
            </div>

            <div className="p-6 max-h-80 overflow-y-auto">
              <div className="space-y-2">
                {selectedMovimientos.map(mov => (
                  <div key={mov.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        mov.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {mov.tipo === 'entrada' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{mov.motivo}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(mov.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${mov.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {mov.tipo === 'entrada' ? '+' : '-'}{mov.cantidad.toLocaleString()} {selectedIngrediente.unidad_medida}
                      </p>
                      <p className="text-xs text-slate-400">
                        {mov.stock_anterior.toLocaleString()} → {mov.stock_nuevo.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {selectedMovimientos.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">Todavía no hay movimientos para este insumo.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-slate-100">
              <button
                onClick={() => setSelectedIngId(null)}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showStockBajo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Stock bajo</h3>
                <p className="text-sm text-slate-500">
                  {todosStockBajo.length} insumos necesitan revisión
                </p>
              </div>
              <button onClick={() => setShowStockBajo(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {todosStockBajo.map(ing => {
                  const status = getStockStatus(ing);
                  return (
                    <button
                      key={ing.id}
                      onClick={() => {
                        setSelectedIngId(ing.id);
                        setShowStockBajo(false);
                      }}
                      className="w-full flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-amber-200 hover:bg-amber-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{ing.nombre}</p>
                        <p className="text-xs text-slate-500 capitalize">{ing.unidad_medida}</p>
                        <p className="text-xs text-slate-400">Proveedor: {getProveedorNombre(ing)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">
                          Actual: <span className="font-semibold">{ing.stock_actual.toLocaleString()}</span> · Mín: {ing.stock_minimo.toLocaleString()}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {todosStockBajo.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">No hay insumos con stock bajo.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-slate-100">
              <button
                onClick={() => setShowStockBajo(false)}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showStockCritico && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Stock crítico</h3>
                <p className="text-sm text-slate-500">
                  {stockBajo.length} insumos están por debajo o igual al mínimo
                </p>
              </div>
              <button onClick={() => setShowStockCritico(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {stockBajo.map(ing => {
                  const status = getStockStatus(ing);
                  return (
                    <button
                      key={ing.id}
                      onClick={() => {
                        setSelectedIngId(ing.id);
                        setShowStockCritico(false);
                      }}
                      className="w-full flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 p-3 text-left hover:border-red-200 hover:bg-red-100 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{ing.nombre}</p>
                        <p className="text-xs text-slate-500 capitalize">{ing.unidad_medida}</p>
                        <p className="text-xs text-slate-400">Proveedor: {getProveedorNombre(ing)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">
                          Actual: <span className="font-semibold text-red-600">{ing.stock_actual.toLocaleString()}</span> · Mín: {ing.stock_minimo.toLocaleString()}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {stockBajo.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">No hay insumos con stock crítico.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-slate-100">
              <button
                onClick={() => setShowStockCritico(false)}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompraNecesaria && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Compra necesaria de productos</h3>
                <p className="text-sm text-slate-500">
                  {compraNecesaria.length} insumos necesitan reposición
                </p>
              </div>
              <button onClick={() => setShowCompraNecesaria(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {compraNecesaria.map(ing => {
                  const status = getStockStatus(ing);
                  return (
                    <div key={ing.id} className="flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                      <button
                        onClick={() => {
                          setSelectedIngId(ing.id);
                          setShowCompraNecesaria(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm font-semibold text-slate-800">{ing.nombre}</p>
                        <p className="text-xs text-slate-500 capitalize">{ing.unidad_medida}</p>
                        <p className="text-xs text-slate-400">Proveedor: {getProveedorNombre(ing)}</p>
                      </button>
                      <div className="text-right">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">
                          Actual: <span className="font-semibold">{ing.stock_actual.toLocaleString()}</span> · Mín: {ing.stock_minimo.toLocaleString()}
                        </p>
                        <p className="text-xs text-blue-700 font-semibold mt-1">
                          Comprar sugerido: {ing.cantidad_sugerida.toLocaleString()} {ing.unidad_medida}
                        </p>
                      </div>
                      <button
                        onClick={() => openCompraFor(ing, ing.cantidad_sugerida)}
                        className="px-3 py-2 rounded-xl bg-blue-500 text-white text-xs font-semibold hover:bg-blue-400 transition-colors"
                      >
                        Comprar
                      </button>
                    </div>
                  );
                })}
                {compraNecesaria.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">No hay compras necesarias por ahora.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-slate-100">
              <button
                onClick={() => setShowCompraNecesaria(false)}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
