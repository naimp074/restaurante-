import { useEffect, useState } from 'react';
import { Plus, Search, Truck, Phone, Mail, User, X, Check, Pencil, Power, Package, ReceiptText, DollarSign, CalendarDays, AlertTriangle } from 'lucide-react';
import type { CuentaDinero, FacturaProveedor, Ingrediente, MetodoPago, PagoProveedor, Proveedor, UnidadMedida } from '../lib/types';
import { loadProveedores, saveProveedores } from '../lib/proveedoresStore';
import {
  crearFacturaProveedor,
  loadCuentasDinero,
  loadFacturasProveedor,
  loadPagosProveedor,
  registrarPagoProveedor,
} from '../lib/finance';
import { loadDemoIngredientes, saveDemoIngredientes } from '../lib/demoStore';

const emptyProveedor: Partial<Proveedor> = {
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  cuit: '',
  direccion: '',
  codigo_fiscal: '',
  activo: true,
};

const getDiasRestantes = (fecha: string) => {
  const hoy = new Date();
  const vencimiento = new Date(`${fecha}T00:00:00`);
  return Math.ceil((vencimiento.getTime() - hoy.getTime()) / 86400000);
};

const formatMoney = (value: number) =>
  value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>(loadProveedores);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(loadDemoIngredientes);
  const [busqueda, setBusqueda] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editProveedor, setEditProveedor] = useState<Partial<Proveedor>>(emptyProveedor);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [detalleTab, setDetalleTab] = useState<'productos' | 'cuenta'>('productos');
  const [facturas, setFacturas] = useState<FacturaProveedor[]>(loadFacturasProveedor);
  const [pagosProveedor, setPagosProveedor] = useState<PagoProveedor[]>(loadPagosProveedor);
  const [cuentasDinero, setCuentasDinero] = useState<CuentaDinero[]>(loadCuentasDinero);
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [pagoFacturaId, setPagoFacturaId] = useState('');
  const [pagoCuentaId, setPagoCuentaId] = useState('cuenta-caja-grande');
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>('efectivo');
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoObservaciones, setPagoObservaciones] = useState('');
  const [showHistorialPagos, setShowHistorialPagos] = useState(true);
  const [historialFacturaId, setHistorialFacturaId] = useState('');
  const [facturaPagoDetalle, setFacturaPagoDetalle] = useState<FacturaProveedor | null>(null);
  const [showFacturaForm, setShowFacturaForm] = useState(false);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [facturaVencimiento, setFacturaVencimiento] = useState(new Date().toISOString().slice(0, 10));
  const [facturaTotal, setFacturaTotal] = useState('');
  const [facturaPagado, setFacturaPagado] = useState('');
  const [facturaObservaciones, setFacturaObservaciones] = useState('');
  const [showVincularForm, setShowVincularForm] = useState(false);
  const [vincularModo, setVincularModo] = useState<'existente' | 'nuevo'>('existente');
  const [vincularIngredienteId, setVincularIngredienteId] = useState('');
  const [vincularBusqueda, setVincularBusqueda] = useState('');
  const [nuevoInsumoNombre, setNuevoInsumoNombre] = useState('');
  const [nuevoInsumoUnidad, setNuevoInsumoUnidad] = useState<UnidadMedida>('unidad');
  const [nuevoInsumoStock, setNuevoInsumoStock] = useState('');
  const [nuevoInsumoStockMinimo, setNuevoInsumoStockMinimo] = useState('');
  const [nuevoInsumoCosto, setNuevoInsumoCosto] = useState('');

  useEffect(() => {
    saveProveedores(proveedores);
  }, [proveedores]);

  const proveedoresFiltrados = proveedores.filter(proveedor => {
    const text = `${proveedor.nombre} ${proveedor.contacto} ${proveedor.telefono} ${proveedor.email} ${proveedor.cuit} ${proveedor.direccion} ${proveedor.codigo_fiscal}`.toLowerCase();
    return text.includes(busqueda.toLowerCase());
  });

  const activos = proveedores.filter(p => p.activo).length;
  const inactivos = proveedores.length - activos;
  const productosProveedor = selectedProveedor
    ? ingredientes.filter(ingrediente => ingrediente.proveedor_id === selectedProveedor.id)
    : [];
  const facturasProveedor = selectedProveedor
    ? facturas.filter(factura => factura.proveedor_id === selectedProveedor.id)
    : [];
  const totalAdeudado = facturasProveedor.reduce((sum, factura) => sum + Math.max(factura.total - factura.pagado, 0), 0);
  const totalPagado = facturasProveedor.reduce((sum, factura) => sum + factura.pagado, 0);
  const facturasPendientes = facturasProveedor.filter(factura => factura.estado !== 'pagada');
  const proximoVencimiento = [...facturasPendientes].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0];
  const pagosProveedorSeleccionado = selectedProveedor
    ? pagosProveedor.filter(pago => pago.proveedor_id === selectedProveedor.id)
    : [];
  const pagosFiltrados = historialFacturaId
    ? pagosProveedorSeleccionado.filter(pago => pago.factura_id === historialFacturaId)
    : pagosProveedorSeleccionado;
  const ingredientesSinProveedorActual = selectedProveedor
    ? ingredientes.filter(item => item.proveedor_id !== selectedProveedor.id)
    : ingredientes;
  const ingredientesFiltradosVincular = ingredientesSinProveedorActual.filter(item => {
    const proveedorNombre = item.proveedor?.nombre || proveedores.find(proveedor => proveedor.id === item.proveedor_id)?.nombre || '';
    const text = `${item.nombre} ${item.unidad_medida} ${proveedorNombre}`.toLowerCase();
    return text.includes(vincularBusqueda.toLowerCase());
  });
  const ingredienteSeleccionadoVincular = ingredientes.find(item => item.id === vincularIngredienteId);

  const refreshFinance = () => {
    setFacturas(loadFacturasProveedor());
    setPagosProveedor(loadPagosProveedor());
    setCuentasDinero(loadCuentasDinero());
  };

  const openNew = () => {
    setEditId(null);
    setEditProveedor(emptyProveedor);
    setShowForm(true);
  };

  const openEdit = (proveedor: Proveedor) => {
    setEditId(proveedor.id);
    setEditProveedor({ ...proveedor });
    setShowForm(true);
  };

  const openDetalle = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
    setDetalleTab('productos');
  };

  const saveProveedor = () => {
    if (!editProveedor.nombre?.trim()) return;

    if (editId) {
      setProveedores(prev => prev.map(proveedor => (
        proveedor.id === editId
          ? {
              ...proveedor,
              nombre: editProveedor.nombre?.trim() || '',
              contacto: editProveedor.contacto?.trim() || '',
              telefono: editProveedor.telefono?.trim() || '',
              email: editProveedor.email?.trim() || '',
              cuit: editProveedor.cuit?.trim() || '',
              direccion: editProveedor.direccion?.trim() || '',
              codigo_fiscal: editProveedor.codigo_fiscal?.trim() || '',
              activo: editProveedor.activo ?? true,
            }
          : proveedor
      )));
    } else {
      const newProveedor: Proveedor = {
        id: `prov-${Date.now()}`,
        nombre: editProveedor.nombre.trim(),
        contacto: editProveedor.contacto?.trim() || '',
        telefono: editProveedor.telefono?.trim() || '',
        email: editProveedor.email?.trim() || '',
        cuit: editProveedor.cuit?.trim() || '',
        direccion: editProveedor.direccion?.trim() || '',
        codigo_fiscal: editProveedor.codigo_fiscal?.trim() || '',
        activo: editProveedor.activo ?? true,
        created_at: new Date().toISOString(),
      };
      setProveedores(prev => [...prev, newProveedor]);
    }

    setShowForm(false);
    setEditId(null);
    setEditProveedor(emptyProveedor);
  };

  const toggleActivo = (proveedorId: string) => {
    setProveedores(prev => prev.map(proveedor => (
      proveedor.id === proveedorId
        ? { ...proveedor, activo: !proveedor.activo }
        : proveedor
    )));
  };

  const openPago = (factura?: FacturaProveedor) => {
    const targetFactura = factura || facturasPendientes[0];
    setPagoFacturaId(targetFactura?.id || '');
    setPagoMonto(targetFactura ? String(Math.max(targetFactura.total - targetFactura.pagado, 0)) : '');
    setPagoCuentaId(cuentasDinero.find(cuenta => cuenta.activa)?.id || 'cuenta-caja-grande');
    setPagoMetodo('efectivo');
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoObservaciones('');
    setShowPagoForm(true);
  };

  const openHistorialPagos = (facturaId = '') => {
    setHistorialFacturaId(facturaId);
    setShowHistorialPagos(true);
  };

  const openDetallePago = (factura: FacturaProveedor) => {
    setFacturaPagoDetalle(factura);
  };

  const openFacturaForm = () => {
    setFacturaNumero('');
    setFacturaFecha(new Date().toISOString().slice(0, 10));
    setFacturaVencimiento(new Date().toISOString().slice(0, 10));
    setFacturaTotal('');
    setFacturaPagado('');
    setFacturaObservaciones('');
    setShowFacturaForm(true);
  };

  const openVincularForm = () => {
    setVincularModo('existente');
    setVincularIngredienteId('');
    setVincularBusqueda('');
    setNuevoInsumoNombre('');
    setNuevoInsumoUnidad('unidad');
    setNuevoInsumoStock('');
    setNuevoInsumoStockMinimo('');
    setNuevoInsumoCosto('');
    setShowVincularForm(true);
  };

  const guardarPagoProveedor = () => {
    if (!selectedProveedor) return;
    const monto = parseFloat(pagoMonto);
    if (!pagoCuentaId || !monto || monto <= 0) return;

    registrarPagoProveedor({
      proveedor_id: selectedProveedor.id,
      factura_id: pagoFacturaId || undefined,
      cuenta_origen_id: pagoCuentaId,
      fecha: pagoFecha,
      metodo_pago: pagoMetodo,
      monto,
      observaciones: pagoObservaciones || `Pago a ${selectedProveedor.nombre}`,
    });

    refreshFinance();
    setShowPagoForm(false);
    setShowHistorialPagos(true);
  };

  const guardarFacturaProveedor = () => {
    if (!selectedProveedor) return;
    const total = parseFloat(facturaTotal);
    const pagado = parseFloat(facturaPagado) || 0;
    if (!facturaNumero.trim() || !total || total <= 0) return;

    const factura = crearFacturaProveedor({
      proveedor_id: selectedProveedor.id,
      numero: facturaNumero,
      fecha: facturaFecha,
      vencimiento: facturaVencimiento,
      total,
      pagado: Math.min(pagado, total),
      observaciones: facturaObservaciones,
    });

    refreshFinance();
    setShowFacturaForm(false);
    setDetalleTab('cuenta');
    setHistorialFacturaId(factura.id);
  };

  const guardarVinculacionProducto = () => {
    if (!selectedProveedor) return;
    const now = new Date().toISOString();
    let nextIngredientes = ingredientes;

    if (vincularModo === 'existente') {
      if (!vincularIngredienteId) return;
      nextIngredientes = ingredientes.map(item => (
        item.id === vincularIngredienteId
          ? { ...item, proveedor_id: selectedProveedor.id, proveedor: selectedProveedor, updated_at: now }
          : item
      ));
    } else {
      if (!nuevoInsumoNombre.trim()) return;
      const nuevoInsumo: Ingrediente = {
        id: `ing-${Date.now()}`,
        nombre: nuevoInsumoNombre.trim(),
        unidad_medida: nuevoInsumoUnidad,
        stock_actual: parseFloat(nuevoInsumoStock) || 0,
        stock_minimo: parseFloat(nuevoInsumoStockMinimo) || 0,
        costo_por_unidad: parseFloat(nuevoInsumoCosto) || 0,
        proveedor_id: selectedProveedor.id,
        proveedor: selectedProveedor,
        activo: true,
        created_at: now,
        updated_at: now,
      };
      nextIngredientes = [...ingredientes, nuevoInsumo];
    }

    setIngredientes(nextIngredientes);
    saveDemoIngredientes(nextIngredientes);
    setShowVincularForm(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Truck size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{proveedores.length}</p>
            <p className="text-xs text-slate-500">Proveedores</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-700">{activos}</p>
          <p className="text-xs text-emerald-600">Activos</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-slate-700">{inactivos}</p>
          <p className="text-xs text-slate-500">Inactivos</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Proveedores</h2>
          <p className="text-sm text-slate-500">Administrá contactos para compras y stock</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Plus size={14} />
          Nuevo Proveedor
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 max-w-md">
            <Search size={15} className="text-slate-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor..."
              className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Proveedor</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contacto</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">CUIT</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dirección</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {proveedoresFiltrados.map(proveedor => (
                <tr
                  key={proveedor.id}
                  onClick={() => openDetalle(proveedor)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Truck size={14} className="text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-800 text-sm">{proveedor.nombre}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{proveedor.contacto || '-'}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{proveedor.telefono || '-'}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{proveedor.email || '-'}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{proveedor.cuit || '-'}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{proveedor.direccion || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      proveedor.activo
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {proveedor.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openEdit(proveedor);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        title="Editar proveedor"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleActivo(proveedor.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
                      >
                        <Power size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {proveedoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                    No se encontraron proveedores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProveedor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Truck size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{selectedProveedor.nombre}</h3>
                    <p className="text-sm text-slate-500">
                      {selectedProveedor.contacto || 'Sin contacto'} · {selectedProveedor.telefono || 'Sin teléfono'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">CUIT: {selectedProveedor.cuit || '-'}</span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">Condición fiscal: {selectedProveedor.codigo_fiscal || '-'}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full ${selectedProveedor.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {selectedProveedor.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedProveedor(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 p-6 border-b border-slate-100">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-xs text-red-600 mb-1">Total adeudado</p>
                <p className="text-xl font-bold text-red-700">{formatMoney(totalAdeudado)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-xs text-emerald-600 mb-1">Facturas pendientes</p>
                <p className="text-xl font-bold text-emerald-700">{facturasPendientes.length}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-blue-600 mb-1">Productos comprados</p>
                <p className="text-xl font-bold text-blue-700">{productosProveedor.length}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-xs text-amber-600 mb-1">Próximo vencimiento</p>
                <p className="text-sm font-bold text-amber-700">
                  {proximoVencimiento ? `${proximoVencimiento.numero} · ${new Date(`${proximoVencimiento.vencimiento}T00:00:00`).toLocaleDateString('es-AR')}` : 'Sin pendientes'}
                </p>
              </div>
            </div>

            <div className="px-6 pt-5">
              <div className="inline-flex bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => setDetalleTab('productos')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    detalleTab === 'productos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Package size={15} />
                  Productos
                </button>
                <button
                  onClick={() => setDetalleTab('cuenta')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    detalleTab === 'cuenta' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ReceiptText size={15} />
                  Estado de cuenta
                </button>
              </div>
            </div>

            <div className="p-6">
              {detalleTab === 'productos' ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <div>
                      <h4 className="font-semibold text-slate-800">Productos que le comprás</h4>
                      <p className="text-sm text-slate-500">Últimos precios, variación y stock actual.</p>
                    </div>
                    <button
                      onClick={openVincularForm}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-3 py-2 rounded-xl text-sm"
                    >
                      <Plus size={14} />
                      Vincular producto
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Producto</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Unidad</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Último precio</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Precio anterior</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Variación</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Cant. compra</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Stock</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Última compra</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {productosProveedor.map((producto, index) => {
                          const precioAnterior = producto.costo_por_unidad * (index % 2 === 0 ? 0.92 : 1.08);
                          const variacion = precioAnterior > 0 ? ((producto.costo_por_unidad - precioAnterior) / precioAnterior) * 100 : 0;
                          const fecha = new Date(Date.now() - (index + 2) * 86400000).toLocaleDateString('es-AR');
                          const cantidadCompra = Math.max(producto.stock_minimo * (index + 2), 1);

                          return (
                            <tr key={producto.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <p className="text-sm font-semibold text-slate-800">{producto.nombre}</p>
                                <p className="text-xs text-slate-400">Stock mínimo: {producto.stock_minimo.toLocaleString()}</p>
                              </td>
                              <td className="py-3 px-4 text-center text-sm text-slate-500 capitalize">{producto.unidad_medida}</td>
                              <td className="py-3 px-4 text-right text-sm font-bold text-slate-800">{formatMoney(producto.costo_por_unidad)}</td>
                              <td className="py-3 px-4 text-right text-sm text-slate-500">{formatMoney(precioAnterior)}</td>
                              <td className={`py-3 px-4 text-right text-sm font-bold ${variacion > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {variacion > 0 ? '+' : ''}{variacion.toFixed(1)}%
                              </td>
                              <td className="py-3 px-4 text-right text-sm text-slate-600">{cantidadCompra.toLocaleString()} {producto.unidad_medida}</td>
                              <td className="py-3 px-4 text-right text-sm text-slate-600">{producto.stock_actual.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right text-sm text-slate-500">{fecha}</td>
                              <td className="py-3 px-4 text-center">
                                <button className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                  Ver historial
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {productosProveedor.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                              Todavía no hay productos vinculados a este proveedor.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end gap-2">
                    <div className="mr-auto bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                      <p className="text-xs text-slate-500">Pagos realizados</p>
                      <p className="text-sm font-bold text-slate-800">{formatMoney(totalPagado)}</p>
                    </div>
                    <button
                      onClick={() => openHistorialPagos()}
                      className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-2 rounded-xl text-sm"
                    >
                      <ReceiptText size={14} />
                      {pagosProveedorSeleccionado.length} pagos
                    </button>
                    <button
                      onClick={openFacturaForm}
                      className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-2 rounded-xl text-sm"
                    >
                      <Plus size={14} />
                      Cargar factura
                    </button>
                    <button
                      onClick={() => openPago()}
                      className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-3 py-2 rounded-xl text-sm"
                    >
                      <DollarSign size={14} />
                      Registrar pago
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Factura</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Total</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Pagado</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Debe</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Vence</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Recargo</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {facturasProveedor.map(factura => {
                          const deuda = Math.max(factura.total - factura.pagado, 0);
                          const dias = getDiasRestantes(factura.vencimiento);
                          const estadoColor = factura.estado === 'pagada'
                            ? 'bg-emerald-100 text-emerald-700'
                            : factura.estado === 'vencida'
                              ? 'bg-red-100 text-red-700'
                              : factura.estado === 'por_vencer'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700';

                          return (
                            <tr key={factura.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <p className="text-sm font-semibold text-slate-800">{factura.numero}</p>
                                <p className="text-xs text-slate-400">Emitida: {new Date(`${factura.fecha}T00:00:00`).toLocaleDateString('es-AR')}</p>
                              </td>
                              <td className="py-3 px-4 text-right text-sm font-semibold text-slate-800">{formatMoney(factura.total)}</td>
                              <td className="py-3 px-4 text-right text-sm text-emerald-600">{formatMoney(factura.pagado)}</td>
                              <td className="py-3 px-4 text-right text-sm font-bold text-red-600">{formatMoney(deuda)}</td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1 text-sm text-slate-600">
                                  <CalendarDays size={13} />
                                  {new Date(`${factura.vencimiento}T00:00:00`).toLocaleDateString('es-AR')}
                                </div>
                                <p className={`text-xs ${dias < 0 ? 'text-red-600' : dias <= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {dias < 0 ? `${Math.abs(dias)} días vencida` : `${dias} días restantes`}
                                </p>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1 text-sm font-semibold text-amber-700">
                                  <AlertTriangle size={13} />
                                  {factura.recargo_por_vencimiento}%
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadoColor}`}>
                                  {factura.estado === 'por_vencer' ? 'Por vencer' : factura.estado.charAt(0).toUpperCase() + factura.estado.slice(1)}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {factura.estado === 'pagada' ? (
                                  <button
                                    onClick={() => openDetallePago(factura)}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                  >
                                    Ver pago
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => openPago(factura)}
                                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                                  >
                                    Registrar pago
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {facturasProveedor.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                              Todavía no hay facturas para este proveedor.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {showHistorialPagos && pagosProveedorSeleccionado.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b border-slate-100">
                        <div>
                          <h4 className="font-semibold text-slate-800">Historial de pagos</h4>
                          <p className="text-xs text-slate-500">
                            {historialFacturaId
                              ? `Filtrado por ${facturas.find(item => item.id === historialFacturaId)?.numero || 'factura'}`
                              : 'Todos los pagos del proveedor'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {historialFacturaId && (
                            <button
                              onClick={() => setHistorialFacturaId('')}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                            >
                              Ver todos
                            </button>
                          )}
                          <button
                            onClick={() => setShowHistorialPagos(false)}
                            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                          >
                            Ocultar
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {pagosFiltrados.slice(0, 8).map(pago => {
                          const cuenta = cuentasDinero.find(item => item.id === pago.cuenta_origen_id);
                          const factura = facturas.find(item => item.id === pago.factura_id);
                          return (
                            <div key={pago.id} className="grid grid-cols-[1fr_150px_150px] gap-3 px-4 py-3 text-sm">
                              <div>
                                <p className="font-semibold text-slate-800">{factura?.numero || 'Pago sin factura'}</p>
                                <p className="text-xs text-slate-400">{pago.observaciones || 'Sin observaciones'}</p>
                              </div>
                              <div className="text-slate-500">
                                {cuenta?.nombre || 'Cuenta'} · {pago.metodo_pago}
                              </div>
                              <div className="text-right font-bold text-emerald-600">{formatMoney(pago.monto)}</div>
                            </div>
                          );
                        })}
                        {pagosFiltrados.length === 0 && (
                          <div className="px-4 py-8 text-center text-sm text-slate-400">
                            No hay pagos para esta factura.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {facturaPagoDetalle && (() => {
        const pagosFactura = pagosProveedor
          .filter(pago => pago.factura_id === facturaPagoDetalle.id)
          .sort((a, b) => a.fecha.localeCompare(b.fecha));
        const ultimoPago = pagosFactura[pagosFactura.length - 1];
        const diasDiferencia = ultimoPago
          ? Math.round((
              new Date(`${ultimoPago.fecha}T00:00:00`).getTime()
              - new Date(`${facturaPagoDetalle.vencimiento}T00:00:00`).getTime()
            ) / 86400000)
          : null;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
              <div className="flex items-start justify-between p-6 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Detalle del pago</p>
                  <h3 className="font-bold text-xl text-slate-800 mt-1">Factura {facturaPagoDetalle.numero}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Vencimiento: {new Date(`${facturaPagoDetalle.vencimiento}T00:00:00`).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <button
                  onClick={() => setFacturaPagoDetalle(null)}
                  aria-label="Cerrar detalle del pago"
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {ultimoPago && diasDiferencia !== null ? (
                  <div className={`rounded-xl border p-4 ${diasDiferencia <= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {diasDiferencia <= 0
                        ? <Check size={18} className="text-emerald-600" />
                        : <AlertTriangle size={18} className="text-red-600" />}
                      <p className={`font-bold ${diasDiferencia <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {diasDiferencia < 0
                          ? `Pagada en término, ${Math.abs(diasDiferencia)} días antes del vencimiento`
                          : diasDiferencia === 0
                            ? 'Pagada en término, el día del vencimiento'
                            : `Pagada fuera de término, ${diasDiferencia} días después del vencimiento`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    La factura figura pagada, pero no tiene una fecha de pago registrada.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Total de la factura</p>
                    <p className="font-bold text-slate-800 mt-1">{formatMoney(facturaPagoDetalle.total)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Fecha de pago</p>
                    <p className="font-bold text-slate-800 mt-1">
                      {ultimoPago ? new Date(`${ultimoPago.fecha}T00:00:00`).toLocaleDateString('es-AR') : 'No registrada'}
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-700">Pagos registrados</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {pagosFactura.map(pago => {
                      const cuenta = cuentasDinero.find(item => item.id === pago.cuenta_origen_id);
                      return (
                        <div key={pago.id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {new Date(`${pago.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {cuenta?.nombre || 'Cuenta'} · {pago.metodo_pago.replace('_', ' ')}
                            </p>
                            {pago.observaciones && <p className="text-xs text-slate-400 mt-0.5">{pago.observaciones}</p>}
                          </div>
                          <p className="font-bold text-emerald-600">{formatMoney(pago.monto)}</p>
                        </div>
                      );
                    })}
                    {pagosFactura.length === 0 && (
                      <p className="px-4 py-6 text-center text-sm text-slate-400">No hay movimientos asociados.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showVincularForm && selectedProveedor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Vincular producto</h3>
                <p className="text-sm text-slate-500">{selectedProveedor.nombre}</p>
              </div>
              <button onClick={() => setShowVincularForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setVincularModo('existente')}
                  className={`p-3 rounded-xl border-2 text-left text-sm font-semibold transition-colors ${
                    vincularModo === 'existente'
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  Insumo existente
                </button>
                <button
                  onClick={() => setVincularModo('nuevo')}
                  className={`p-3 rounded-xl border-2 text-left text-sm font-semibold transition-colors ${
                    vincularModo === 'nuevo'
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  Crear insumo nuevo
                </button>
              </div>

              {vincularModo === 'existente' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Buscar insumo</label>
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                      <Search size={15} className="text-slate-400" />
                      <input
                        value={vincularBusqueda}
                        onChange={e => setVincularBusqueda(e.target.value)}
                        className="flex-1 text-sm outline-none"
                        placeholder="Escribi nombre, unidad o proveedor..."
                      />
                    </div>
                  </div>

                  {ingredienteSeleccionadoVincular && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{ingredienteSeleccionadoVincular.nombre}</p>
                        <p className="text-xs text-slate-500">
                          Stock {ingredienteSeleccionadoVincular.stock_actual.toLocaleString()} {ingredienteSeleccionadoVincular.unidad_medida} · Costo ${ingredienteSeleccionadoVincular.costo_por_unidad.toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setVincularIngredienteId('')}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Quitar
                      </button>
                    </div>
                  )}

                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {ingredientesFiltradosVincular.slice(0, 8).map(item => {
                      const proveedorNombre = item.proveedor?.nombre || proveedores.find(proveedor => proveedor.id === item.proveedor_id)?.nombre || 'Sin proveedor';
                      const selected = item.id === vincularIngredienteId;

                      return (
                        <button
                          key={item.id}
                          onClick={() => setVincularIngredienteId(item.id)}
                          className={`w-full px-3 py-3 text-left hover:bg-amber-50 transition-colors ${
                            selected ? 'bg-amber-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{item.nombre}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {item.unidad_medida} · proveedor actual: {proveedorNombre}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-slate-700">${item.costo_por_unidad.toLocaleString()}</p>
                              <p className="text-[11px] text-slate-400">stock {item.stock_actual.toLocaleString()}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {ingredientesFiltradosVincular.length === 0 && (
                      <div className="px-3 py-8 text-center text-sm text-slate-400">
                        No encontre insumos con esa busqueda.
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">
                    Al vincularlo, este proveedor quedara como proveedor principal del insumo.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label>
                    <input
                      value={nuevoInsumoNombre}
                      onChange={e => setNuevoInsumoNombre(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                      placeholder="Ej: Carne picada especial"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unidad</label>
                      <select
                        value={nuevoInsumoUnidad}
                        onChange={e => setNuevoInsumoUnidad(e.target.value as UnidadMedida)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                      >
                        {(['gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete'] as UnidadMedida[]).map(unidad => (
                          <option key={unidad} value={unidad}>{unidad}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Costo unitario</label>
                      <input
                        type="number"
                        value={nuevoInsumoCosto}
                        onChange={e => setNuevoInsumoCosto(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stock actual</label>
                      <input
                        type="number"
                        value={nuevoInsumoStock}
                        onChange={e => setNuevoInsumoStock(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stock minimo</label>
                      <input
                        type="number"
                        value={nuevoInsumoStockMinimo}
                        onChange={e => setNuevoInsumoStockMinimo(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowVincularForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarVinculacionProducto}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}

      {showFacturaForm && selectedProveedor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Cargar factura</h3>
                <p className="text-sm text-slate-500">{selectedProveedor.nombre}</p>
              </div>
              <button onClick={() => setShowFacturaForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Numero de factura *</label>
                <input
                  value={facturaNumero}
                  onChange={e => setFacturaNumero(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="Ej: F-00045"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                  <input
                    type="date"
                    value={facturaFecha}
                    onChange={e => setFacturaFecha(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Vencimiento</label>
                  <input
                    type="date"
                    value={facturaVencimiento}
                    onChange={e => setFacturaVencimiento(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Total *</label>
                  <input
                    type="number"
                    value={facturaTotal}
                    onChange={e => setFacturaTotal(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pagado inicial</label>
                  <input
                    type="number"
                    value={facturaPagado}
                    onChange={e => setFacturaPagado(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                <textarea
                  value={facturaObservaciones}
                  onChange={e => setFacturaObservaciones(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                  rows={3}
                  placeholder="Detalle opcional de la compra o condiciones del proveedor"
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowFacturaForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarFacturaProveedor}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Guardar factura
              </button>
            </div>
          </div>
        </div>
      )}

      {showPagoForm && selectedProveedor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Registrar pago a proveedor</h3>
                <p className="text-sm text-slate-500">{selectedProveedor.nombre}</p>
              </div>
              <button onClick={() => setShowPagoForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Factura</label>
                <select
                  value={pagoFacturaId}
                  onChange={e => {
                    const facturaId = e.target.value;
                    const factura = facturasProveedor.find(item => item.id === facturaId);
                    setPagoFacturaId(facturaId);
                    if (factura) setPagoMonto(String(Math.max(factura.total - factura.pagado, 0)));
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  <option value="">Pago sin aplicar a factura</option>
                  {facturasProveedor.map(factura => (
                    <option key={factura.id} value={factura.id}>
                      {factura.numero} - debe {formatMoney(Math.max(factura.total - factura.pagado, 0))}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Monto</label>
                  <input
                    type="number"
                    value={pagoMonto}
                    onChange={e => setPagoMonto(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                  <input
                    type="date"
                    value={pagoFecha}
                    onChange={e => setPagoFecha(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Metodo</label>
                  <select
                    value={pagoMetodo}
                    onChange={e => setPagoMetodo(e.target.value as MetodoPago)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="debito">Debito</option>
                    <option value="credito">Credito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Debe luego del pago</label>
                  <div className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-slate-50">
                    {(() => {
                      const factura = facturasProveedor.find(item => item.id === pagoFacturaId);
                      if (!factura) return '-';
                      return formatMoney(Math.max(factura.total - factura.pagado - (parseFloat(pagoMonto) || 0), 0));
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">De donde sale la plata</label>
                <select
                  value={pagoCuentaId}
                  onChange={e => setPagoCuentaId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                >
                  {cuentasDinero.filter(cuenta => cuenta.activa).map(cuenta => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.nombre} - saldo {formatMoney(cuenta.saldo)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                <textarea
                  value={pagoObservaciones}
                  onChange={e => setPagoObservaciones(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                  rows={3}
                  placeholder="Ej: transferencia comprobante 123, pago parcial, efectivo de caja grande"
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowPagoForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarPagoProveedor}
                className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Guardar pago
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
              <button onClick={() => setShowForm(false)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <Truck size={15} className="text-slate-400" />
                  <input
                    value={editProveedor.nombre || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, nombre: e.target.value }))}
                    className="flex-1 text-sm outline-none"
                    placeholder="Nombre del proveedor"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contacto</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <User size={15} className="text-slate-400" />
                  <input
                    value={editProveedor.contacto || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, contacto: e.target.value }))}
                    className="flex-1 text-sm outline-none"
                    placeholder="Persona de contacto"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <Phone size={15} className="text-slate-400" />
                  <input
                    value={editProveedor.telefono || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, telefono: e.target.value }))}
                    className="flex-1 text-sm outline-none"
                    placeholder="Teléfono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <Mail size={15} className="text-slate-400" />
                  <input
                    type="email"
                    value={editProveedor.email || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, email: e.target.value }))}
                    className="flex-1 text-sm outline-none"
                    placeholder="email@proveedor.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">CUIT</label>
                  <input
                    value={editProveedor.cuit || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, cuit: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="30-00000000-0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Condición fiscal</label>
                  <input
                    value={editProveedor.codigo_fiscal || ''}
                    onChange={e => setEditProveedor(prev => ({ ...prev, codigo_fiscal: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Condición fiscal"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
                <input
                  value={editProveedor.direccion || ''}
                  onChange={e => setEditProveedor(prev => ({ ...prev, direccion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="Dirección del proveedor"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={editProveedor.activo ?? true}
                  onChange={e => setEditProveedor(prev => ({ ...prev, activo: e.target.checked }))}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                Proveedor activo
              </label>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveProveedor}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
