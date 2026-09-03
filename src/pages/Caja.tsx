import { useEffect, useState } from 'react';
import { CreditCard, Check, X, Printer, Lock, Unlock, CalendarDays, Search, Plus, User, FileText, RefreshCw } from 'lucide-react';
import type { CajaDiaria, Pedido, MetodoPago, Pago, TipoComprobante } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { loadCuentasDinero, loadMovimientosFinancieros, registrarEntradaCuenta } from '../lib/finance';
import { loadDemoPedidos, saveDemoPedidos } from '../lib/demoStore';

type TipoDocumentoCliente = 'DNI' | 'CUIT' | 'CUIL';

interface ClienteFrecuente {
  id: string;
  tipo_documento: TipoDocumentoCliente;
  numero_documento: string;
  nombre: string;
  condicion_iva: string;
  telefono: string;
  domicilio: string;
  nota: string;
}

interface ApartadoCaja {
  id: string;
  fecha: string;
  nombre: string;
  monto: number;
  observaciones: string;
}

const clientesFrecuentesMock: ClienteFrecuente[] = [
  {
    id: 'cli-1',
    tipo_documento: 'DNI',
    numero_documento: '34865724',
    nombre: 'Consumidor Final',
    condicion_iva: 'Consumidor final',
    telefono: '11 5488-2400',
    domicilio: 'Av. San Martin 1240',
    nota: 'Cliente frecuente de mediodía',
  },
  {
    id: 'cli-2',
    tipo_documento: 'CUIT',
    numero_documento: '30711222334',
    nombre: 'Oficinas Centro SRL',
    condicion_iva: 'Responsable inscripto',
    telefono: '11 4321-9000',
    domicilio: 'Reconquista 455, CABA',
    nota: 'Solicita factura A',
  },
  {
    id: 'cli-3',
    tipo_documento: 'CUIL',
    numero_documento: '20301234567',
    nombre: 'Mariela Gómez',
    condicion_iva: 'Monotributista',
    telefono: '11 6150-7788',
    domicilio: 'Belgrano 742',
    nota: 'Prefiere contacto por WhatsApp',
  },
];

const emptyCliente: Omit<ClienteFrecuente, 'id'> = {
  tipo_documento: 'DNI',
  numero_documento: '',
  nombre: '',
  condicion_iva: 'Consumidor final',
  telefono: '',
  domicilio: '',
  nota: '',
};

interface CajaProps {
  vista?: 'caja' | 'cobros';
  apartadoInicial?: 'dia' | 'arqueos';
}

const metodosConfig: Record<MetodoPago, { label: string; color: string; icon: string }> = {
  efectivo: { label: 'Efectivo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '$' },
  transferencia: { label: 'Transferencia', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '↔' },
  debito: { label: 'Débito', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '💳' },
  credito: { label: 'Crédito', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '💳' },
  mixto: { label: 'Pago Mixto', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: '+' },
};

const comprobantesConfig: Record<TipoComprobante, { label: string; descripcion: string }> = {
  ticket: { label: 'Ticket', descripcion: 'Comprobante simple' },
  factura_x: { label: 'Factura X', descripcion: 'No fiscal' },
  factura_b: { label: 'Factura B', descripcion: 'Consumidor final' },
  factura_a: { label: 'Factura A', descripcion: 'Responsable inscripto' },
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const getMesaLabel = (pedido?: Pedido) => {
  if (!pedido?.mesa) return 'Mesa';
  return pedido.mesa.nombre || `Mesa ${pedido.mesa.numero}`;
};

const getCompradorName = (value: string) => value.trim() || 'Consumidor final';

const getActiveItems = (pedido: Pedido) =>
  (pedido.items || []).filter(item => item.estado !== 'cancelado');

const cajaStorageKey = 'restaurant-cajas-diarias';
const apartadosCajaStorageKey = 'restaurant-apartados-caja';
const todayKey = () => new Date().toISOString().slice(0, 10);

const loadCajas = (): CajaDiaria[] => {
  try {
    const saved = window.localStorage.getItem(cajaStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as CajaDiaria[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const loadApartadosCaja = (): ApartadoCaja[] => {
  try {
    const saved = window.localStorage.getItem(apartadosCajaStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as ApartadoCaja[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getPagoBreakdown = (pago: Pago) => {
  const tarjeta = pago.monto_debito + pago.monto_credito;
  return {
    efectivo: pago.monto_efectivo,
    transferencia: pago.monto_transferencia,
    tarjeta,
  };
};

export default function Caja({ vista = 'caja', apartadoInicial = 'dia' }: CajaProps) {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>(
    () => loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cancelado')
  );
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [descuento, setDescuento] = useState(0);
  const [recargo, setRecargo] = useState(0);
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoMixtoEfectivo, setMontoMixtoEfectivo] = useState('');
  const [montoMixtoTransferencia, setMontoMixtoTransferencia] = useState('');
  const [montoMixtoDebito, setMontoMixtoDebito] = useState('');
  const [montoMixtoCredito, setMontoMixtoCredito] = useState('');
  const [pagoError, setPagoError] = useState('');
  const [compradorNombre, setCompradorNombre] = useState('');
  const [clientes, setClientes] = useState<ClienteFrecuente[]>(clientesFrecuentesMock);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<ClienteFrecuente | null>(null);
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [clienteDraft, setClienteDraft] = useState<Omit<ClienteFrecuente, 'id'>>(emptyCliente);
  const [pagosRegistrados, setPagosRegistrados] = useState<Pago[]>([]);
  const [showTicket, setShowTicket] = useState(false);
  const [lastPago, setLastPago] = useState<Pago | null>(null);
  const [cajas, setCajas] = useState<CajaDiaria[]>(loadCajas);
  const [apartadosCaja, setApartadosCaja] = useState<ApartadoCaja[]>(loadApartadosCaja);
  const [montoInicial, setMontoInicial] = useState('');
  const [montoCierreEfectivo, setMontoCierreEfectivo] = useState('');
  const [showCierreCaja, setShowCierreCaja] = useState(false);
  const [nuevoApartadoNombre, setNuevoApartadoNombre] = useState('');
  const [nuevoApartadoMonto, setNuevoApartadoMonto] = useState('');
  const [cuentasDinero, setCuentasDinero] = useState(loadCuentasDinero);
  const [movimientosFinancieros, setMovimientosFinancieros] = useState(loadMovimientosFinancieros);

  const cajaAbierta = cajas.find(caja => caja.fecha === todayKey() && caja.estado === 'abierta') || null;
  const cajaDelDia = cajaAbierta || cajas.find(caja => caja.fecha === todayKey()) || null;
  const historialCajas = [...cajas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const apartadosHoy = apartadosCaja.filter(apartado => apartado.fecha === todayKey());
  const totalApartadosHoy = apartadosHoy.reduce((sum, apartado) => sum + apartado.monto, 0);
  const efectivoEsperadoApartados = cajaDelDia?.monto_esperado_efectivo ?? 0;
  const pagosProveedorHoy = movimientosFinancieros.filter(mov => mov.fecha === todayKey() && mov.origen === 'pago_proveedor');
  const totalPagosProveedorHoy = pagosProveedorHoy.reduce((sum, mov) => sum + mov.monto, 0);
  const clientesFiltrados = clientes.filter(cliente => {
    const text = `${cliente.nombre} ${cliente.numero_documento} ${cliente.telefono} ${cliente.condicion_iva}`.toLowerCase();
    return text.includes(clienteBusqueda.toLowerCase());
  });

  useEffect(() => {
    window.localStorage.setItem(cajaStorageKey, JSON.stringify(cajas));
  }, [cajas]);

  useEffect(() => {
    window.localStorage.setItem(apartadosCajaStorageKey, JSON.stringify(apartadosCaja));
  }, [apartadosCaja]);

  useEffect(() => {
    const refrescarPedidos = () => {
      const actualizados = loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cancelado');
      setPedidos(actualizados);
      setSelectedPedido(actual => actual ? actualizados.find(pedido => pedido.id === actual.id) || null : null);
    };
    window.addEventListener('restaurant-pedidos-updated', refrescarPedidos);
    window.addEventListener('focus', refrescarPedidos);
    return () => {
      window.removeEventListener('restaurant-pedidos-updated', refrescarPedidos);
      window.removeEventListener('focus', refrescarPedidos);
    };
  }, []);

  const calcTotal = () => {
    if (!selectedPedido) return 0;
    return selectedPedido.subtotal - descuento + recargo;
  };

  const calcVuelto = () => {
    const ef = parseFloat(montoEfectivo) || 0;
    return Math.max(0, ef - calcTotal());
  };

  const abrirCaja = () => {
    const inicial = parseFloat(montoInicial) || 0;
    const nuevaCaja: CajaDiaria = {
      id: `caja-${Date.now()}`,
      fecha: todayKey(),
      cajero_id: user?.id,
      cajero_nombre: user ? `${user.nombre} ${user.apellido}` : 'Cajero',
      monto_inicial: inicial,
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      total_ventas: 0,
      monto_esperado_efectivo: inicial,
      estado: 'abierta',
      opened_at: new Date().toISOString(),
    };

    setCajas(prev => [nuevaCaja, ...prev.filter(caja => !(caja.fecha === nuevaCaja.fecha && caja.estado === 'abierta'))]);
    setApartadosCaja(prev => [
      {
        id: `apartado-${Date.now()}`,
        fecha: nuevaCaja.fecha,
        nombre: 'Caja grande',
        monto: inicial,
        observaciones: 'Efectivo inicial del día',
      },
      ...prev.filter(apartado => apartado.fecha !== nuevaCaja.fecha),
    ]);
    registrarEntradaCuenta({
      cuenta_id: 'cuenta-caja-grande',
      monto: inicial,
      descripcion: 'Apertura de caja del dia',
      origen: 'apertura_caja',
      fecha: nuevaCaja.fecha,
    });
    setCuentasDinero(loadCuentasDinero());
    setMovimientosFinancieros(loadMovimientosFinancieros());
    setMontoInicial('');
  };

  const cerrarCaja = () => {
    if (!cajaAbierta) return;

    const efectivoContado = parseFloat(montoCierreEfectivo) || 0;
    setCajas(prev => prev.map(caja => (
      caja.id === cajaAbierta.id
        ? {
            ...caja,
            monto_cierre_efectivo: efectivoContado,
            diferencia_efectivo: efectivoContado - caja.monto_esperado_efectivo,
            estado: 'cerrada',
            closed_at: new Date().toISOString(),
          }
        : caja
    )));
    setMontoCierreEfectivo('');
    setShowCierreCaja(false);
  };

  const agregarApartadoCaja = () => {
    const nombre = nuevoApartadoNombre.trim() || `Apartado ${apartadosHoy.length + 1}`;

    const nuevoApartado: ApartadoCaja = {
      id: `apartado-${Date.now()}`,
      fecha: todayKey(),
      nombre,
      monto: parseFloat(nuevoApartadoMonto) || 0,
      observaciones: '',
    };

    setApartadosCaja(prev => [...prev, nuevoApartado]);
    setNuevoApartadoNombre('');
    setNuevoApartadoMonto('');
  };

  const actualizarApartadoCaja = (apartadoId: string, field: 'monto' | 'observaciones', value: string) => {
    setApartadosCaja(prev => prev.map(apartado => (
      apartado.id === apartadoId
        ? {
            ...apartado,
            [field]: field === 'monto' ? parseFloat(value) || 0 : value,
          }
        : apartado
    )));
  };

  const eliminarApartadoCaja = (apartadoId: string) => {
    setApartadosCaja(prev => prev.filter(apartado => apartado.id !== apartadoId));
  };

  const selectPedido = (pedido: Pedido) => {
    setSelectedPedido(pedido);
  };

  const seleccionarCliente = (cliente: ClienteFrecuente) => {
    setSelectedCliente(cliente);
    setCompradorNombre(cliente.nombre);
    setClienteBusqueda(cliente.nombre);
  };

  const clearCliente = () => {
    setSelectedCliente(null);
    setCompradorNombre('');
    setClienteBusqueda('');
  };

  const openClienteForm = () => {
    setClienteDraft(emptyCliente);
    setShowClienteForm(true);
  };

  const buscarDatosCliente = () => {
    const numero = clienteDraft.numero_documento.replace(/\D/g, '');
    if (!numero) return;

    const clienteEncontrado = clientes.find(cliente => cliente.numero_documento.replace(/\D/g, '') === numero);
    if (clienteEncontrado) {
      setClienteDraft({
        tipo_documento: clienteEncontrado.tipo_documento,
        numero_documento: clienteEncontrado.numero_documento,
        nombre: clienteEncontrado.nombre,
        condicion_iva: clienteEncontrado.condicion_iva,
        telefono: clienteEncontrado.telefono,
        domicilio: clienteEncontrado.domicilio,
        nota: clienteEncontrado.nota,
      });
      return;
    }

    setClienteDraft(prev => ({
      ...prev,
      nombre: prev.tipo_documento === 'DNI' ? 'Cliente encontrado por DNI' : 'Razón social encontrada',
      condicion_iva: prev.tipo_documento === 'DNI' ? 'Consumidor final' : 'Responsable inscripto',
      domicilio: 'Domicilio fiscal simulado',
      nota: 'Datos autocompletados en frontend. Luego se puede conectar con ARCA/backend.',
    }));
  };

  const guardarCliente = () => {
    if (!clienteDraft.numero_documento.trim() || !clienteDraft.nombre.trim()) return;

    const nuevoCliente: ClienteFrecuente = {
      id: `cli-${Date.now()}`,
      ...clienteDraft,
      numero_documento: clienteDraft.numero_documento.trim(),
      nombre: clienteDraft.nombre.trim(),
      telefono: clienteDraft.telefono.trim(),
      domicilio: clienteDraft.domicilio.trim(),
      nota: clienteDraft.nota.trim(),
    };

    setClientes(prev => [nuevoCliente, ...prev]);
    seleccionarCliente(nuevoCliente);
    setShowClienteForm(false);
  };

  const updateLastPagoComprobante = (tipo: TipoComprobante) => {
    setLastPago(prev => prev ? { ...prev, tipo_comprobante: tipo } : prev);
    setPagosRegistrados(prev => prev.map(pago => (
      pago.id === lastPago?.id ? { ...pago, tipo_comprobante: tipo } : pago
    )));
  };

  const printTicket = (pago: Pago) => {
    if (!pago.pedido) return;

    const items = getActiveItems(pago.pedido);
    const fecha = new Date(pago.created_at);
    const comprobante = comprobantesConfig[pago.tipo_comprobante || 'ticket'];
    const ticketHtml = `
      <!doctype html>
      <html>
        <head>
          <title>${comprobante.label} ${getMesaLabel(pago.pedido)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 12px; font-family: Arial, sans-serif; color: #111827; }
            .ticket { width: 300px; margin: 0 auto; }
            .center { text-align: center; }
            .title { font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; }
            .muted { color: #64748b; font-size: 11px; }
            .line { border-top: 1px dashed #94a3b8; margin: 10px 0; }
            .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
            .item-name { max-width: 175px; }
            .person { margin-top: 10px; font-size: 13px; font-weight: 800; text-transform: uppercase; }
            .total { font-size: 14px; font-weight: 800; }
            .grand-total { font-size: 18px; font-weight: 900; margin-top: 8px; }
            @media print {
              body { padding: 0; }
              .ticket { width: 72mm; }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="center">
              <p class="title">Restaurante</p>
              <div class="muted">${comprobante.label} de consumo</div>
            </div>
            <div class="line"></div>
            <div class="row"><span>Comprobante</span><span>${comprobante.label}</span></div>
            <div class="row"><span>${getMesaLabel(pago.pedido)}</span><span>${fecha.toLocaleDateString('es-AR')}</span></div>
            <div class="row"><span>Comprador</span><span>${pago.comprador_nombre || 'Consumidor final'}</span></div>
            <div class="row"><span>Moza: ${pago.pedido.empleado?.nombre || '-'}</span><span>${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="row"><span>Personas</span><span>${pago.pedido.cantidad_personas}</span></div>
            <div class="line"></div>
            ${items.map(item => `
              <div class="row">
                <span class="item-name">${item.cantidad}x ${item.producto?.nombre || 'Producto'}</span>
                <span>${formatMoney(item.subtotal)}</span>
              </div>
            `).join('')}
            <div class="line"></div>
            ${pago.descuento_aplicado > 0 ? `<div class="row"><span>Descuento</span><span>-${formatMoney(pago.descuento_aplicado)}</span></div>` : ''}
            ${pago.recargo_aplicado > 0 ? `<div class="row"><span>Recargo</span><span>${formatMoney(pago.recargo_aplicado)}</span></div>` : ''}
            <div class="row"><span>Método</span><span>${metodosConfig[pago.metodo_pago].label}</span></div>
            <div class="center grand-total">Total: ${formatMoney(pago.total_cobrado)}</div>
            <div class="line"></div>
            <div class="center muted">Gracias por su visita</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=380,height=650');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
  };

  const procesarPago = () => {
    if (!selectedPedido || !cajaAbierta) return;
    const total = calcTotal();
    const mixtoEfectivo = parseFloat(montoMixtoEfectivo) || 0;
    const mixtoTransferencia = parseFloat(montoMixtoTransferencia) || 0;
    const mixtoDebito = parseFloat(montoMixtoDebito) || 0;
    const mixtoCredito = parseFloat(montoMixtoCredito) || 0;
    const totalMixto = mixtoEfectivo + mixtoTransferencia + mixtoDebito + mixtoCredito;
    const cantidadMetodosMixtos = [mixtoEfectivo, mixtoTransferencia, mixtoDebito, mixtoCredito].filter(valor => valor > 0).length;
    if (metodoPago === 'mixto' && (Math.abs(totalMixto - total) > 0.009 || cantidadMetodosMixtos < 2)) {
      setPagoError(`Distribuí el total de $${total.toLocaleString()} entre por lo menos dos medios de pago.`);
      return;
    }
    if (metodoPago === 'efectivo' && (parseFloat(montoEfectivo) || total) < total) {
      setPagoError('El monto recibido en efectivo no alcanza para completar el cobro.');
      return;
    }
    setPagoError('');
    const pedidoCobrado = selectedPedido;
    const pago: Pago = {
      id: `pago-${Date.now()}`,
      pedido_id: pedidoCobrado.id,
      cajero_id: 'demo-admin-id',
      comprador_nombre: selectedCliente?.nombre || getCompradorName(compradorNombre),
      tipo_comprobante: 'ticket',
      metodo_pago: metodoPago,
      monto: total,
      monto_efectivo: metodoPago === 'efectivo' ? total : metodoPago === 'mixto' ? mixtoEfectivo : 0,
      monto_transferencia: metodoPago === 'transferencia' ? total : metodoPago === 'mixto' ? mixtoTransferencia : 0,
      monto_debito: metodoPago === 'debito' ? total : metodoPago === 'mixto' ? mixtoDebito : 0,
      monto_credito: metodoPago === 'credito' ? total : metodoPago === 'mixto' ? mixtoCredito : 0,
      descuento_aplicado: descuento,
      recargo_aplicado: recargo,
      total_cobrado: total,
      vuelto: metodoPago === 'efectivo' ? calcVuelto() : 0,
      created_at: new Date().toISOString(),
      pedido: pedidoCobrado,
    };
    const breakdown = getPagoBreakdown(pago);
    setPagosRegistrados(prev => [pago, ...prev]);
    const pedidoCerrado: Pedido = {
      ...pedidoCobrado,
      estado: 'cobrado',
      hora_cierre: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setPedidos(prev => prev.filter(pedido => pedido.id !== pedidoCerrado.id));
    saveDemoPedidos(loadDemoPedidos().map(pedido => pedido.id === pedidoCerrado.id ? pedidoCerrado : pedido));
    setCajas(prev => prev.map(caja => (
      caja.id === cajaAbierta.id
        ? {
            ...caja,
            efectivo: caja.efectivo + breakdown.efectivo,
            tarjeta: caja.tarjeta + breakdown.tarjeta,
            transferencia: caja.transferencia + breakdown.transferencia,
            total_ventas: caja.total_ventas + pago.total_cobrado,
            monto_esperado_efectivo: caja.monto_esperado_efectivo + breakdown.efectivo,
          }
        : caja
    )));
    setLastPago(pago);
    setShowTicket(true);
    setSelectedPedido(null);
    setDescuento(0);
    setRecargo(0);
    setMontoEfectivo('');
    setMontoMixtoEfectivo('');
    setMontoMixtoTransferencia('');
    setMontoMixtoDebito('');
    setMontoMixtoCredito('');
    setPagoError('');
    setCompradorNombre('');
    setSelectedCliente(null);
    setClienteBusqueda('');
  };

  const cancelarComprobante = () => {
    if (lastPago?.pedido) {
      const breakdown = getPagoBreakdown(lastPago);
      setSelectedPedido(lastPago.pedido);
      setPagosRegistrados(prev => prev.filter(pago => pago.id !== lastPago.id));
      setCajas(prev => prev.map(caja => (
        caja.id === cajaAbierta?.id
          ? {
              ...caja,
              efectivo: Math.max(0, caja.efectivo - breakdown.efectivo),
              tarjeta: Math.max(0, caja.tarjeta - breakdown.tarjeta),
              transferencia: Math.max(0, caja.transferencia - breakdown.transferencia),
              total_ventas: Math.max(0, caja.total_ventas - lastPago.total_cobrado),
              monto_esperado_efectivo: Math.max(caja.monto_inicial, caja.monto_esperado_efectivo - breakdown.efectivo),
            }
          : caja
      )));
      setCompradorNombre(lastPago.comprador_nombre === 'Consumidor final' ? '' : lastPago.comprador_nombre || '');
      setDescuento(lastPago.descuento_aplicado);
      setRecargo(lastPago.recargo_aplicado);
      setMontoEfectivo('');
    }

    setLastPago(null);
    setShowTicket(false);
  };

  const ventaHoy = pagosRegistrados.reduce((s, p) => s + p.total_cobrado, 0);

  const renderApartadosCaja = () => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">Apartados de efectivo</h3>
            <p className="text-sm text-slate-500">Registrá dónde dejás la plata al hacer el arqueo.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total apartado</p>
            <p className="text-lg font-bold text-slate-800">{formatMoney(totalApartadosHoy)}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-[1fr_140px_auto] gap-2">
          <input
            value={nuevoApartadoNombre}
            onChange={e => setNuevoApartadoNombre(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            placeholder="Ej: Caja grande, caja chica, sobre oficina"
          />
          <input
            type="number"
            value={nuevoApartadoMonto}
            onChange={e => setNuevoApartadoMonto(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 text-right"
            placeholder="Monto"
            min="0"
          />
          <button
            type="button"
            onClick={agregarApartadoCaja}
            className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 rounded-xl text-sm flex items-center gap-2"
          >
            <Plus size={14} />
            Agregar
          </button>
        </div>

        <div className="space-y-2">
          {apartadosHoy.map(apartado => (
            <div key={apartado.id} className="grid grid-cols-[1fr_140px_1fr_auto] gap-2 items-center bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{apartado.nombre}</p>
                <p className="text-xs text-slate-400">Apartado del día</p>
              </div>
              <input
                type="number"
                value={apartado.monto || ''}
                onChange={e => actualizarApartadoCaja(apartado.id, 'monto', e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 text-right font-semibold"
                min="0"
              />
              <input
                value={apartado.observaciones}
                onChange={e => actualizarApartadoCaja(apartado.id, 'observaciones', e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                placeholder="Nota opcional"
              />
              <button
                onClick={() => eliminarApartadoCaja(apartado.id)}
                className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Eliminar apartado"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          {apartadosHoy.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              Todavía no hay apartados de efectivo cargados.
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">Efectivo esperado</p>
            <p className="text-lg font-bold text-slate-800">{formatMoney(efectivoEsperadoApartados)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs text-blue-600">Distribuido</p>
            <p className="text-lg font-bold text-blue-700">{formatMoney(totalApartadosHoy)}</p>
          </div>
          <div className={`rounded-xl p-3 border ${
            totalApartadosHoy === efectivoEsperadoApartados
              ? 'bg-emerald-50 border-emerald-100'
              : 'bg-amber-50 border-amber-100'
          }`}>
            <p className={`text-xs ${totalApartadosHoy === efectivoEsperadoApartados ? 'text-emerald-600' : 'text-amber-600'}`}>
              Diferencia
            </p>
            <p className={`text-lg font-bold ${totalApartadosHoy === efectivoEsperadoApartados ? 'text-emerald-700' : 'text-amber-700'}`}>
              {formatMoney(totalApartadosHoy - efectivoEsperadoApartados)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderArqueos = () => (
    <>
      {renderApartadosCaja()}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Saldos por cuenta</h3>
            <p className="text-sm text-slate-500">Caja, bancos y billeteras que usan los pagos a proveedores.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            {cuentasDinero.filter(cuenta => cuenta.activa).map(cuenta => (
              <div key={cuenta.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{cuenta.nombre}</p>
                <p className={`text-lg font-bold ${cuenta.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatMoney(cuenta.saldo)}
                </p>
                <p className="text-[11px] text-slate-400 capitalize">{cuenta.tipo.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Pagos a proveedores hoy</p>
          <p className="text-2xl font-bold text-red-600">{formatMoney(totalPagosProveedorHoy)}</p>
          <div className="mt-3 space-y-2 max-h-36 overflow-y-auto">
            {pagosProveedorHoy.slice(0, 4).map(mov => {
              const cuenta = cuentasDinero.find(item => item.id === mov.cuenta_id);
              return (
                <div key={mov.id} className="text-xs flex justify-between gap-3 border-b border-slate-50 pb-2">
                  <span className="text-slate-500 truncate">{mov.descripcion}</span>
                  <span className="font-semibold text-slate-700 whitespace-nowrap">{cuenta?.nombre || 'Cuenta'}</span>
                </div>
              );
            })}
            {pagosProveedorHoy.length === 0 && (
              <p className="text-sm text-slate-400">Sin pagos a proveedores hoy.</p>
            )}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <CalendarDays size={18} className="text-slate-500" />
        <h3 className="font-semibold text-slate-800">Arqueos</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Día</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Inicial</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Efectivo</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Tarjeta</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Transferencia</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Total</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {historialCajas.map(caja => (
              <tr key={caja.id}>
                <td className="py-3 px-4 text-sm font-medium text-slate-700">{new Date(`${caja.fecha}T00:00:00`).toLocaleDateString('es-AR')}</td>
                <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.monto_inicial)}</td>
                <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.efectivo)}</td>
                <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.tarjeta)}</td>
                <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.transferencia)}</td>
                <td className="py-3 px-4 text-sm font-bold text-right">{formatMoney(caja.total_ventas)}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    caja.estado === 'abierta' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {caja.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                  </span>
                </td>
              </tr>
            ))}
            {historialCajas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">Todavía no hay arqueos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );

  if (!cajaAbierta && vista === 'cobros') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-xl mx-auto text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock size={26} className="text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Caja cerrada</h2>
        <p className="text-sm text-slate-500 mt-2">
          Para cobrar comandas primero tenés que abrir la caja del día desde el apartado Caja.
        </p>
      </div>
    );
  }

  if (vista === 'caja' && apartadoInicial === 'arqueos') {
    return (
      <div className="space-y-6">
        {renderArqueos()}
      </div>
    );
  }

  if (!cajaAbierta) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-xl mx-auto">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
            <Unlock size={26} className="text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Abrir caja del día</h2>
          <p className="text-sm text-slate-500 mt-1">
            Para comenzar a vender, cargá con cuánto efectivo inicia la caja de hoy.
          </p>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Monto inicial en efectivo</label>
            <input
              type="number"
              value={montoInicial}
              onChange={e => setMontoInicial(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-semibold outline-none focus:border-amber-400"
              placeholder="Ej: 20000"
              min="0"
            />
          </div>

          <button
            onClick={abrirCaja}
            className="mt-5 w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Unlock size={18} />
            Abrir caja
          </button>
        </div>

      </div>
    );
  }

  return (
    <div className={vista === 'caja' ? 'space-y-6' : 'flex gap-6 h-full'}>
      <div className={vista === 'caja' ? 'space-y-4' : 'w-72 flex-shrink-0 space-y-4'}>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Caja inicial</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(cajaAbierta.monto_inicial)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total ventas</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(cajaAbierta.total_ventas || ventaHoy)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs text-emerald-600 mb-1">Efectivo</p>
            <p className="text-lg font-bold text-emerald-700">{formatMoney(cajaAbierta.efectivo)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <p className="text-xs text-purple-600 mb-1">Tarjeta</p>
            <p className="text-lg font-bold text-purple-700">{formatMoney(cajaAbierta.tarjeta)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-600 mb-1">Transferencia</p>
            <p className="text-lg font-bold text-blue-700">{formatMoney(cajaAbierta.transferencia)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-600 mb-1">Esperado efectivo</p>
            <p className="text-lg font-bold text-amber-700">{formatMoney(cajaAbierta.monto_esperado_efectivo)}</p>
          </div>
        </div>

        {vista === 'caja' && (
          <button
            onClick={() => setShowCierreCaja(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <Lock size={16} />
            Cerrar caja / arqueo
          </button>
        )}

        {vista === 'cobros' && (
        <>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mesas por Cobrar</p>
            <button title="Actualizar mesas" onClick={() => setPedidos(loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cancelado'))} className="text-slate-400 hover:text-amber-600"><RefreshCw size={14} /></button>
          </div>
          <div className="divide-y divide-slate-50">
            {pedidos.filter(p => p.total > 0).map(pedido => (
              <button
                key={pedido.id}
                onClick={() => selectPedido(pedido)}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-colors ${selectedPedido?.id === pedido.id ? 'bg-amber-50 border-l-2 border-amber-500' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-slate-800 text-sm">{getMesaLabel(pedido)}</span>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                    {pedido.estado === 'entregado' ? 'Por cobrar' : pedido.estado}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{pedido.empleado?.nombre}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">{pedido.items?.length} items</span>
                  <span className="text-sm font-bold text-slate-800">${pedido.total.toLocaleString()}</span>
                </div>
              </button>
            ))}
            {pedidos.filter(p => p.total > 0).length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No hay mesas por cobrar</div>
            )}
          </div>
        </div>

        {pagosRegistrados.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Último pagos</p>
            </div>
            <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {pagosRegistrados.slice(0, 5).map(pago => (
                <div key={pago.id} className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">{getMesaLabel(pago.pedido)}</span>
                    <span className="text-sm font-bold text-emerald-600">${pago.total_cobrado.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs text-slate-400">{metodosConfig[pago.metodo_pago].label}</span>
                    <span className="text-xs text-slate-400">{new Date(pago.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {vista === 'cobros' && (
      <div className="flex-1 min-w-0">
        {selectedPedido ? (
          <div className="bg-white rounded-2xl border border-slate-200 h-full flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{getMesaLabel(selectedPedido)}</h3>
                  <p className="text-sm text-slate-500">{selectedPedido.empleado?.nombre} · {selectedPedido.cantidad_personas} personas</p>
                </div>
                <button
                  onClick={() => setSelectedPedido(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2 mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Detalle del pedido</h4>
                {getActiveItems(selectedPedido).map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.cantidad}x {item.producto?.nombre}</span>
                    <span className="font-medium text-slate-800">${item.subtotal.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span>${selectedPedido.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-24">Descuento $</label>
                  <input
                    type="number"
                    value={descuento || ''}
                    onChange={e => setDescuento(parseFloat(e.target.value) || 0)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-emerald-600"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-24">Recargo $</label>
                  <input
                    type="number"
                    value={recargo || ''}
                    onChange={e => setRecargo(parseFloat(e.target.value) || 0)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-orange-600"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t border-slate-200">
                  <span>TOTAL</span>
                  <span className="text-amber-600">${calcTotal().toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">Comprador</label>
                  <button
                    onClick={openClienteForm}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <Plus size={13} />
                    Agregar cliente
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/60">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                    <Search size={15} className="text-slate-400" />
                    <input
                      value={clienteBusqueda}
                      onChange={e => {
                        setClienteBusqueda(e.target.value);
                        setSelectedCliente(null);
                        setCompradorNombre(e.target.value);
                      }}
                      className="flex-1 text-sm outline-none"
                      placeholder="Buscar cliente frecuente por nombre, DNI o teléfono"
                    />
                    {clienteBusqueda && (
                      <button onClick={clearCliente} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {clienteBusqueda && !selectedCliente && (
                    <div className="mt-2 bg-white border border-slate-100 rounded-xl overflow-hidden">
                      {clientesFiltrados.slice(0, 4).map(cliente => (
                        <button
                          key={cliente.id}
                          onClick={() => seleccionarCliente(cliente)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-amber-50 border-b border-slate-50 last:border-b-0"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{cliente.nombre}</p>
                            <p className="text-xs text-slate-400">{cliente.tipo_documento} {cliente.numero_documento} · {cliente.condicion_iva}</p>
                          </div>
                          <User size={15} className="text-slate-400" />
                        </button>
                      ))}
                      {clientesFiltrados.length === 0 && (
                        <div className="px-3 py-3 text-sm text-slate-400">
                          No está cargado. Podés agregarlo como cliente nuevo.
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCliente ? (
                    <div className="mt-3 bg-white border border-emerald-100 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{selectedCliente.nombre}</p>
                          <p className="text-xs text-slate-500">
                            {selectedCliente.tipo_documento} {selectedCliente.numero_documento} · {selectedCliente.condicion_iva}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{selectedCliente.domicilio || 'Sin domicilio'} · {selectedCliente.telefono || 'Sin teléfono'}</p>
                        </div>
                        <button onClick={clearCliente} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                          Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-2">Si lo dejás vacío, saldrá como Consumidor final.</p>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Método de pago</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(Object.keys(metodosConfig) as MetodoPago[]).map(met => (
                    <button
                      key={met}
                      onClick={() => { setMetodoPago(met); setPagoError(''); }}
                      className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        metodoPago === met
                          ? metodosConfig[met].color + ' border-current shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {metodosConfig[met].label}
                    </button>
                  ))}
                </div>

                {metodoPago === 'efectivo' && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-600 w-28">Monto recibido $</label>
                    <input
                      type="number"
                      value={montoEfectivo}
                      onChange={e => setMontoEfectivo(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 font-semibold"
                      placeholder={calcTotal().toString()}
                    />
                  </div>
                )}

                {metodoPago === 'mixto' && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-700">Distribuir el pago</p>
                      <p className="text-xs text-slate-500">Usá dos o más medios. Dejá en cero los que no necesites.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-4">
                      {([
                        ['Efectivo', montoMixtoEfectivo, setMontoMixtoEfectivo],
                        ['Transferencia', montoMixtoTransferencia, setMontoMixtoTransferencia],
                        ['Débito', montoMixtoDebito, setMontoMixtoDebito],
                        ['Crédito', montoMixtoCredito, setMontoMixtoCredito],
                      ] as Array<[string, string, (value: string) => void]>).map(([label, value, setter]) => (
                        <label key={label} className="block">
                          <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label} $</span>
                          <input type="number" min="0" value={value} onChange={e => { setter(e.target.value); setPagoError(''); }} placeholder="0" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right font-semibold outline-none focus:border-amber-400" />
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between px-4 py-3 border-t border-slate-100 text-sm">
                      <span className="text-slate-500">Total a cobrar: <strong className="text-slate-800">${calcTotal().toLocaleString()}</strong></span>
                      <span className={Math.abs((parseFloat(montoMixtoEfectivo) || 0) + (parseFloat(montoMixtoTransferencia) || 0) + (parseFloat(montoMixtoDebito) || 0) + (parseFloat(montoMixtoCredito) || 0) - calcTotal()) < 0.009 ? 'text-emerald-600' : 'text-red-600'}>
                        Distribuido: <strong>${((parseFloat(montoMixtoEfectivo) || 0) + (parseFloat(montoMixtoTransferencia) || 0) + (parseFloat(montoMixtoDebito) || 0) + (parseFloat(montoMixtoCredito) || 0)).toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {montoEfectivo && calcVuelto() > 0 && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                    <span className="text-sm text-emerald-700 font-medium">Vuelto</span>
                    <span className="text-lg font-bold text-emerald-700">${calcVuelto().toLocaleString()}</span>
                  </div>
                )}
                {pagoError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700">{pagoError}</div>}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100">
              <button
                onClick={procesarPago}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 text-lg transition-all shadow-lg shadow-emerald-500/30"
              >
                <Check size={22} />
                Cobrar ${calcTotal().toLocaleString()}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <CreditCard size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-lg font-medium">Seleccioná una mesa para cobrar</p>
            </div>
          </div>
        )}
      </div>
      )}

      {showCierreCaja && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Arqueo de cierre</h3>
                <p className="text-sm text-slate-500">{new Date(`${cajaAbierta.fecha}T00:00:00`).toLocaleDateString('es-AR')}</p>
              </div>
              <button onClick={() => setShowCierreCaja(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-xs text-emerald-600">Efectivo ventas</p>
                  <p className="text-lg font-bold text-emerald-700">{formatMoney(cajaAbierta.efectivo)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs text-amber-600">Esperado efectivo</p>
                  <p className="text-lg font-bold text-amber-700">{formatMoney(cajaAbierta.monto_esperado_efectivo)}</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                  <p className="text-xs text-purple-600">Tarjeta</p>
                  <p className="text-lg font-bold text-purple-700">{formatMoney(cajaAbierta.tarjeta)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs text-blue-600">Transferencia</p>
                  <p className="text-lg font-bold text-blue-700">{formatMoney(cajaAbierta.transferencia)}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Efectivo contado al cierre</label>
                <input
                  type="number"
                  value={montoCierreEfectivo}
                  onChange={e => setMontoCierreEfectivo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder={String(cajaAbierta.monto_esperado_efectivo)}
                  min="0"
                />
              </div>

              {montoCierreEfectivo && (
                <div className="flex justify-between rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
                  <span className="text-slate-500">Diferencia</span>
                  <span className={`font-bold ${
                    (parseFloat(montoCierreEfectivo) || 0) - cajaAbierta.monto_esperado_efectivo === 0
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}>
                    {formatMoney((parseFloat(montoCierreEfectivo) || 0) - cajaAbierta.monto_esperado_efectivo)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowCierreCaja(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={cerrarCaja}
                className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 flex items-center justify-center gap-2"
              >
                <Lock size={15} />
                Cerrar caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showClienteForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Agregar cliente</h3>
                <p className="text-sm text-slate-500">Buscá por documento y completá los datos del comprador.</p>
              </div>
              <button onClick={() => setShowClienteForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo doc.</label>
                  <select
                    value={clienteDraft.tipo_documento}
                    onChange={e => setClienteDraft(prev => ({ ...prev, tipo_documento: e.target.value as TipoDocumentoCliente }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Número de documento</label>
                  <div className="flex gap-2">
                    <input
                      value={clienteDraft.numero_documento}
                      onChange={e => setClienteDraft(prev => ({ ...prev, numero_documento: e.target.value }))}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                      placeholder="Ej: 34865724"
                    />
                    <button
                      onClick={buscarDatosCliente}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
                    >
                      <Search size={14} />
                      Buscar datos
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2 text-sm text-blue-700">
                <FileText size={16} className="mt-0.5 shrink-0" />
                <p>
                  En esta etapa la búsqueda está simulada en frontend. Después se puede conectar el CUIT/CUIL con ARCA desde backend y usar DNI para clientes guardados.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre / Razón social *</label>
                  <input
                    value={clienteDraft.nombre}
                    onChange={e => setClienteDraft(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Condición frente al IVA</label>
                  <select
                    value={clienteDraft.condicion_iva}
                    onChange={e => setClienteDraft(prev => ({ ...prev, condicion_iva: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option>Consumidor final</option>
                    <option>Responsable inscripto</option>
                    <option>Monotributista</option>
                    <option>Exento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono de contacto</label>
                  <input
                    value={clienteDraft.telefono}
                    onChange={e => setClienteDraft(prev => ({ ...prev, telefono: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Teléfono o WhatsApp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domicilio</label>
                  <input
                    value={clienteDraft.domicilio}
                    onChange={e => setClienteDraft(prev => ({ ...prev, domicilio: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Domicilio fiscal o entrega"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nota</label>
                <textarea
                  value={clienteDraft.nota}
                  onChange={e => setClienteDraft(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 min-h-[90px]"
                  placeholder="Observaciones del cliente"
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowClienteForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCliente}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={15} />
                Guardar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {showTicket && lastPago && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Pago registrado</h3>
              <p className="text-slate-500 text-sm mt-1">{getMesaLabel(lastPago.pedido)}</p>
            </div>

            <div className="p-6 space-y-2 border-b border-dashed border-slate-200">
              <div className="pb-3">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Elegí qué querés imprimir</h4>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(comprobantesConfig) as TipoComprobante[]).map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => updateLastPagoComprobante(tipo)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        (lastPago.tipo_comprobante || 'ticket') === tipo
                          ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{comprobantesConfig[tipo].label}</span>
                      <span className="block text-xs opacity-75">{comprobantesConfig[tipo].descripcion}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm text-slate-500">Total cobrado</p>
                <p className="text-3xl font-bold text-slate-800">${lastPago.total_cobrado.toLocaleString()}</p>
              </div>
              {lastPago.vuelto > 0 && (
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-slate-500">Vuelto</span>
                  <span className="font-bold text-emerald-600">${lastPago.vuelto.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Método</span>
                <span className="font-medium text-slate-700">{metodosConfig[lastPago.metodo_pago].label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Comprobante</span>
                <span className="font-medium text-slate-700">{comprobantesConfig[lastPago.tipo_comprobante || 'ticket'].label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Comprador</span>
                <span className="font-medium text-slate-700">{lastPago.comprador_nombre || 'Consumidor final'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Hora</span>
                <span className="font-medium text-slate-700">{new Date(lastPago.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="p-6 flex gap-3">
              <button
                onClick={() => printTicket(lastPago)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50"
              >
                <Printer size={14} />
                Imprimir {comprobantesConfig[lastPago.tipo_comprobante || 'ticket'].label}
              </button>
              <button
                onClick={cancelarComprobante}
                className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
