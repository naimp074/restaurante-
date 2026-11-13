import { useEffect, useRef, useState } from 'react';
import { guardarClienteCuenta, pasarPedidoACuenta, saldoCliente, useCuentaCorriente, mediosCobroCuenta } from '../lib/cuentaCorrienteStore';
import type { ClienteCuenta, MedioCobroCuenta } from '../lib/cuentaCorrienteStore';
import { CreditCard, Check, X, Printer, Lock, Unlock, CalendarDays, Search, Plus, User, FileText, RefreshCw, BellRing, Undo2, AlertTriangle } from 'lucide-react';
import type { CajaDiaria, Pedido, MetodoPago, Pago, TipoComprobante } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import {
  cerrarCajaDia,
  cuentaBancoId,
  cuentaCajaDiaId,
  cuentaCajaGrandeId,
  loadCuentasDinero,
  loadMovimientosFinancieros,
  registrarEntradaCuenta,
  registrarSalidaCuenta,
  transferirEntreCuentas,
} from '../lib/finance';
import { loadDemoPedidos, saveDemoPedidos } from '../lib/demoStore';
import { descontarStockPorVenta, reponerStockPorVenta } from '../lib/ventasStock';
import { dayKey } from '../lib/fechas';
import { withStoreTransaction, writeStore } from '../lib/storeSync';
import { calcularAjusteLista, useListasPrecios } from '../lib/listasPreciosStore';
import { loadCajasDiarias, saveCajasDiarias, useCajas } from '../lib/cajaStore';
import { loadPagos, savePagos, usePagos } from '../lib/pagosStore';
import { useGastos } from '../lib/gastosStore';
import { sincronizarEstadoMesa } from '../lib/mesasStore';
import { tomarPedidoACobrar } from '../lib/mesaAAbrir';
import { descuentaStock } from '../lib/costosReceta';
import { canalDe, cobraEnCaja, etiquetaPedido, nombresCanal } from '../lib/pedidosCanal';
import { loadProductos } from '../lib/productosStore';
import { nuevoId } from '../lib/ids';
import { readStore } from '../lib/storeSync';
import {
  armarReceptor,
  cargarConfigFacturacion,
  condicionesIva,
  descartarComprobante,
  emitirFactura,
  emitirNotaCredito,
  letraSegunCondicion,
  nombreComprobante,
  numeroComprobante,
  receptorDesdeCliente,
  reintentarComprobante,
  type ComprobanteFiscal,
  type ConfigFacturacion,
  type ReceptorFactura,
} from '../lib/facturacion';
import { abrirVentanaTicket, imprimirComprobanteFiscal } from '../lib/ticketFiscal';
import { loadCategorias } from '../lib/categoriasStore';
import { armarAvisoCierre } from '../lib/avisoCierreCaja';
import { enviarAvisoCierreCaja } from '../lib/enviarAvisoCierre';
import { lineasPorCategoria } from '../lib/lineasFiscales';
import { DetalleItem } from '../components/OpcionesProducto';
import RelojItem from '../components/RelojItem';
import { detalleTicket } from '../lib/opcionesProducto';
import {
  anularTicket, cobroEnCurso, conEvento, describirReparto, estadoCobro, estadoCobroConfig, importeFijado, marcarPagada, marcarTicketEmitido,
  nombreMedio, pagoIdDeSolicitud, rechazarSolicitud, solicitudDesactualizada, type Actor,
} from '../lib/cobroComanda';
import PedirMotivo from '../components/PedirMotivo';
import DetalleArqueo from '../components/DetalleArqueo';

type TipoDocumentoCliente = 'DNI' | 'CUIT' | 'CUIL';

type ClienteFrecuente = ClienteCuenta;

interface ApartadoCaja {
  id: string;
  fecha: string;
  nombre: string;
  monto: number;
  observaciones: string;
}

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
  tarjeta: { label: 'Tarjeta', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: '💳' },
  debito: { label: 'Débito', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '💳' },
  credito: { label: 'Crédito', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '💳' },
  // Entra al banco como una transferencia; el cobro queda registrado como Mercado Pago.
  mercado_pago: { label: 'Mercado Pago', color: 'bg-sky-100 text-sky-700 border-sky-200', icon: 'MP' },
  mixto: { label: 'Pago Mixto', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: '+' },
};

const comprobantesConfig: Record<TipoComprobante, { label: string; descripcion: string }> = {
  ticket: { label: 'Ticket', descripcion: 'Para el cliente, con los productos' },
  factura: { label: 'Factura', descripcion: 'ARCA, por categoría' },
  factura_x: { label: 'Ticket', descripcion: 'No válido como factura' },
  factura_b: { label: 'Ticket', descripcion: 'No válido como factura' },
  factura_a: { label: 'Ticket', descripcion: 'No válido como factura' },
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const montoContado = (texto: string) => {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
};

/** Mesa, para llevar, delivery o PedidosYa: el nombre sale del canal del pedido. */
const getMesaLabel = (pedido?: Pedido) => etiquetaPedido(pedido);

const getCompradorName = (value: string) => value.trim() || 'Consumidor final';

const getActiveItems = (pedido: Pedido) =>
  (pedido.items || []).filter(item => item.estado !== 'cancelado');

const apartadosCajaStorageKey = 'restaurant-apartados-caja';
const todayKey = () => dayKey();

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
  const tarjeta = (pago.monto_tarjeta || 0) + pago.monto_debito + pago.monto_credito;
  return {
    efectivo: pago.monto_efectivo,
    transferencia: pago.monto_transferencia,
    tarjeta,
  };
};

export default function Caja({ vista = 'caja', apartadoInicial = 'dia' }: CajaProps) {
  const gastos = useGastos();
  const { user, modoDemo } = useAuth();
  /**
   * Los importes de la caja (inicial, ventas, efectivo, esperado, arqueos, saldos) los ve solo el admin.
   * Los demás cierran a ciegas: cuentan el efectivo sin ver cuánto debería haber.
   */
  const cierreACiegas = user?.rol !== 'admin';
  const verTotalesCaja = !cierreACiegas;
  const [pedidos, setPedidos] = useState<Pedido[]>(
    () => loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado')
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
  const { clientes, movimientos: movimientosCuenta } = useCuentaCorriente();
  const [aCuenta, setACuenta] = useState(false);
  const [anticipoCuenta, setAnticipoCuenta] = useState('');
  const [medioAnticipo, setMedioAnticipo] = useState<MedioCobroCuenta>('efectivo');
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const cuentaEnProceso = useRef(false);
  const cobroEnProceso = useRef(false);
  const [avisoCuenta, setAvisoCuenta] = useState('');
  const [clienteError, setClienteError] = useState('');
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<ClienteFrecuente | null>(null);
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [clienteDraft, setClienteDraft] = useState<Omit<ClienteFrecuente, 'id'>>(emptyCliente);
  const pagosRegistrados = usePagos();
  const [confirmarSinReceta, setConfirmarSinReceta] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [lastPago, setLastPago] = useState<Pago | null>(null);
  const [configFiscal, setConfigFiscal] = useState<ConfigFacturacion | null>(null);
  const [receptor, setReceptor] = useState<ReceptorFactura>(() => armarReceptor('', 5, ''));
  const [factura, setFactura] = useState<ComprobanteFiscal | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const cajas = useCajas();
  const [apartadosCaja, setApartadosCaja] = useState<ApartadoCaja[]>(loadApartadosCaja);
  const [montoInicial, setMontoInicial] = useState('');
  const [aperturaError, setAperturaError] = useState('');
  const [montoCierreEfectivo, setMontoCierreEfectivo] = useState('');
  const [cierreError, setCierreError] = useState('');
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [mensajeCierre, setMensajeCierre] = useState('');
  const [mensajeCierreError, setMensajeCierreError] = useState(false);
  const [showCierreCaja, setShowCierreCaja] = useState(false);
  const [arqueoAbierto, setArqueoAbierto] = useState<CajaDiaria | null>(null);
  const [nuevoApartadoNombre, setNuevoApartadoNombre] = useState('');
  const [nuevoApartadoMonto, setNuevoApartadoMonto] = useState('');
  const [cuentasDinero, setCuentasDinero] = useState(loadCuentasDinero);
  const [movimientosFinancieros, setMovimientosFinancieros] = useState(loadMovimientosFinancieros);
  const listasPrecios = useListasPrecios();
  const actor: Actor = { id: user?.id, nombre: user ? [user.nombre, user.apellido].filter(Boolean).join(' ') : 'Caja', rol: user?.rol };
  const [devolviendo, setDevolviendo] = useState<'rechazar' | 'anular_ticket' | null>(null);
  const [devolverError, setDevolverError] = useState('');
  const [avisoSolicitud, setAvisoSolicitud] = useState('');
  // Lo que dice el ticket impreso: mientras exista, el cobro tiene que ser exactamente eso.
  const fijado = selectedPedido ? importeFijado(selectedPedido) : null;

  useEffect(() => {
    if (modoDemo) return;
    // Sin configuración (o sin la migración aplicada) la caja sigue con tickets.
    cargarConfigFacturacion().then(config => setConfigFiscal(config?.activo ? config : null)).catch(() => setConfigFiscal(null));
  }, [modoDemo]);

  // Lo pagado en la app de PedidosYa no pasa por esta caja (ver pedidosExternos.ts).
  // Lo que pidió cobrar el salón va primero, el más viejo arriba.
  const pedidosPorCobrar = pedidos
    .filter(p => p.total > 0 && cobraEnCaja(p))
    .map((pedido, orden) => ({ pedido, orden }))
    .sort((a, b) => {
      const ea = cobroEnCurso(a.pedido) ? a.pedido.solicitud_cobro!.solicitada_at : '';
      const eb = cobroEnCurso(b.pedido) ? b.pedido.solicitud_cobro!.solicitada_at : '';
      if (ea && eb) return ea.localeCompare(eb);
      if (ea || eb) return ea ? -1 : 1;
      return a.orden - b.orden;
    })
    .map(({ pedido }) => pedido);
  const solicitudesActivas = pedidosPorCobrar.filter(cobroEnCurso).length;
  const cajaAbierta = cajas.find(caja => caja.fecha === todayKey() && caja.estado === 'abierta') || null;
  const cajaDelDia = cajaAbierta || cajas.find(caja => caja.fecha === todayKey()) || null;
  const historialCajas = [...cajas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const apartadosHoy = apartadosCaja.filter(apartado => apartado.fecha === todayKey());
  const totalApartadosHoy = apartadosHoy.reduce((sum, apartado) => sum + apartado.monto, 0);
  const efectivoEsperadoApartados = cajaDelDia?.monto_esperado_efectivo ?? 0;
  const pagosProveedorHoy = movimientosFinancieros.filter(mov => mov.fecha === todayKey() && mov.origen === 'pago_proveedor');
  const totalPagosProveedorHoy = pagosProveedorHoy.reduce((sum, mov) => sum + mov.monto, 0);
  const clientesFiltrados = clientes
    .filter(cliente => {
      const text = `${cliente.nombre} ${cliente.numero_documento} ${cliente.telefono} ${cliente.condicion_iva}`.toLowerCase();
      return text.includes(clienteBusqueda.toLowerCase());
    })
    .sort((a, b) => {
      const deuda = saldoCliente(b.id, movimientosCuenta) - saldoCliente(a.id, movimientosCuenta);
      return deuda || a.nombre.localeCompare(b.nombre, 'es');
    });
  const listaPrecioSeleccionada = aCuenta || metodoPago === 'mixto'
    ? null
    : listasPrecios.find(lista => lista.metodo_pago === metodoPago) || null;
  const montoAjusteLista = selectedPedido
    ? calcularAjusteLista(selectedPedido, listaPrecioSeleccionada)
    : 0;

  useEffect(() => {
    writeStore(apartadosCajaStorageKey, apartadosCaja, 'restaurant-apartados-caja-updated');
  }, [apartadosCaja]);

  useEffect(() => {
    const ticket = selectedPedido ? importeFijado(selectedPedido) : null;
    if (ticket) {
      // Con ticket impreso no se recalcula nada: se cobra lo que dice el papel.
      setMetodoPago(ticket.metodo_pago);
      setDescuento(ticket.descuento);
      setRecargo(ticket.recargo);
      return;
    }
    const monto = selectedPedido ? calcularAjusteLista(selectedPedido, listaPrecioSeleccionada) : 0;
    if (listaPrecioSeleccionada?.tipo_ajuste === 'recargo') {
      setDescuento(0);
      setRecargo(monto);
    } else {
      setDescuento(monto);
      setRecargo(0);
    }
  }, [selectedPedido, listaPrecioSeleccionada]);

  useEffect(() => {
    const refrescarPedidos = () => {
      const actualizados = loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado');
      setPedidos(actualizados);
      setSelectedPedido(actual => actual ? actualizados.find(pedido => pedido.id === actual.id) || null : null);
    };
    // 'storage': otra pestaña del mismo navegador (p. ej. Comandas abierta al lado) pidió un cobro.
    const desdeOtraPestana = (evento: StorageEvent) => { if (evento.key === null || evento.key === 'restaurant-demo-pedidos') refrescarPedidos(); };
    window.addEventListener('restaurant-pedidos-updated', refrescarPedidos);
    window.addEventListener('focus', refrescarPedidos);
    window.addEventListener('storage', desdeOtraPestana);
    return () => {
      window.removeEventListener('restaurant-pedidos-updated', refrescarPedidos);
      window.removeEventListener('focus', refrescarPedidos);
      window.removeEventListener('storage', desdeOtraPestana);
    };
  }, []);

  const calcTotal = () => {
    if (!selectedPedido) return 0;
    return Math.max(0, selectedPedido.subtotal - descuento + recargo);
  };

  const productosSinReceta = (pedido: Pedido) => {
    const catalogo = loadProductos();
    return (pedido.items || [])
      .filter(item => item.estado !== 'cancelado')
      .map(item => catalogo.find(p => p.id === item.producto_id) || item.producto)
      .filter((producto): producto is NonNullable<typeof producto> => Boolean(producto && !descuentaStock(producto)));
  };

  const gastosCajaHoy = gastos.filter(gasto =>
    gasto.fecha === todayKey() && gasto.alcance === 'caja_dia' && (gasto.estado || 'pagado') === 'pagado'
  );
  const totalGastosCajaHoy = gastosCajaHoy.reduce((sum, gasto) => {
    if (gasto.metodo_pago === 'mixto') {
      return sum + (gasto.pagos_divididos?.find(parte => parte.metodo_pago === 'efectivo')?.monto || 0);
    }
    return gasto.metodo_pago === 'efectivo' ? sum + gasto.monto : sum;
  }, 0);

  const calcVuelto = () => {
    const ef = parseFloat(montoEfectivo) || 0;
    return Math.max(0, ef - calcTotal());
  };

  const abrirCaja = () => {
    const inicial = parseFloat(montoInicial) || 0;
    setAperturaError('');
    if (!Number.isFinite(inicial) || inicial < 0) { setAperturaError('El monto inicial debe ser cero o mayor.'); return; }
    if (loadCajasDiarias().some(caja => caja.fecha === todayKey() && caja.estado === 'abierta')) { setAperturaError('Ya hay una caja abierta para hoy.'); return; }
    const nuevaCaja: CajaDiaria = {
      id: nuevoId('caja'),
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

    try {
      withStoreTransaction(() => {
        saveCajasDiarias([nuevaCaja, ...loadCajasDiarias()]);
        transferirEntreCuentas({
          cuenta_origen_id: cuentaCajaGrandeId,
          cuenta_destino_id: cuentaCajaDiaId,
          monto: inicial,
          descripcion: 'Apertura de caja: fondo inicial del día',
          fecha: nuevaCaja.fecha,
        });
      });
    } catch (error) {
      setAperturaError(error instanceof Error ? error.message : 'No se pudo abrir la caja.');
      return;
    }
    setApartadosCaja(prev => [
      {
        id: nuevoId('apartado'),
        fecha: nuevaCaja.fecha,
        nombre: 'Caja del día',
        monto: inicial,
        observaciones: 'Efectivo inicial del día',
      },
      ...prev.filter(apartado => apartado.fecha !== nuevaCaja.fecha),
    ]);
    setCuentasDinero(loadCuentasDinero());
    setMovimientosFinancieros(loadMovimientosFinancieros());
    setMontoInicial('');
    setMensajeCierre('');
  };

  const cerrarCaja = async () => {
    if (!cajaAbierta || cerrandoCaja) return;

    // Para cerrar solo se cuenta el efectivo del cajón: las transferencias ya quedan registradas en cada cobro.
    const efectivoContado = montoContado(montoCierreEfectivo);
    if (efectivoContado === null) {
      setCierreError('Ingresá cuánto efectivo hay en la caja.');
      return;
    }

    const conteo = {
      fecha: cajaAbierta.fecha,
      cajero: cajaAbierta.cajero_nombre || (user ? `${user.nombre} ${user.apellido}`.trim() : 'Cajero'),
      esperadoEfectivo: cajaAbierta.monto_esperado_efectivo,
      contadoEfectivo: efectivoContado,
      // No se cuenta: se toma como lo registrado, así el aviso de faltante mira solo el efectivo.
      esperadoTransferencia: cajaAbierta.transferencia,
      contadoTransferencia: cajaAbierta.transferencia,
    };
    const aviso = armarAvisoCierre(conteo);

    setCierreError('');
    setCerrandoCaja(true);
    try {
      saveCajasDiarias(cajas.map(caja => (
        caja.id === cajaAbierta.id
          ? {
              ...caja,
              monto_cierre_efectivo: efectivoContado,
              diferencia_efectivo: efectivoContado - caja.monto_esperado_efectivo,
              estado: 'cerrada',
              closed_at: new Date().toISOString(),
              cerrado_por_id: user?.id,
              cerrado_por_nombre: user ? `${user.nombre} ${user.apellido || ''}`.trim() : 'Cajero',
            }
          : caja
      )));
      cerrarCajaDia(`Cierre de caja del ${cajaAbierta.fecha}: efectivo del día a caja grande`);
    } catch (error) {
      setCierreError(error instanceof Error ? error.message : 'No se pudo cerrar la caja.');
      setCerrandoCaja(false);
      return;
    }
    setCuentasDinero(loadCuentasDinero());
    setMovimientosFinancieros(loadMovimientosFinancieros());
    setMontoCierreEfectivo('');
    setShowCierreCaja(false);
    setCerrandoCaja(false);
    setMensajeCierreError(false);
    setMensajeCierre('Caja cerrada.');

    if (!aviso || modoDemo) return;

    try {
      const enviado = await enviarAvisoCierreCaja(conteo);
      if (aviso.tipo === 'falta' && enviado && !cierreACiegas) {
        setMensajeCierre('Caja cerrada. Se avisó al administrador que está faltando plata.');
      }
    } catch (error) {
      setMensajeCierreError(true);
      setMensajeCierre(`La caja quedó cerrada, pero no pude avisar por Gmail. ${error instanceof Error ? error.message : ''}`.trim());
    }
  };

  const agregarApartadoCaja = () => {
    const nombre = nuevoApartadoNombre.trim() || `Apartado ${apartadosHoy.length + 1}`;

    const nuevoApartado: ApartadoCaja = {
      id: nuevoId('apartado'),
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
    setACuenta(false); setAnticipoCuenta(''); setPagoError(''); setAvisoCuenta(''); setAvisoSolicitud('');
    // Arranca con el medio que eligió la moza; caja lo puede cambiar si el cliente paga distinto.
    if (cobroEnCurso(pedido) && pedido.solicitud_cobro) {
      setMetodoPago(pedido.solicitud_cobro.metodo_pago);
      // Pago mixto: viene repartido por la moza; caja lo revisa y lo puede corregir.
      const reparto = pedido.solicitud_cobro.metodo_pago === 'mixto' ? pedido.solicitud_cobro.reparto : undefined;
      if (reparto) {
        const texto = (monto: number) => (monto > 0 ? String(monto) : '');
        setMontoMixtoEfectivo(texto(reparto.efectivo));
        setMontoMixtoTransferencia(texto(reparto.transferencia));
        setMontoMixtoDebito(texto(reparto.debito));
        setMontoMixtoCredito(texto(reparto.credito));
      }
    }
    setSelectedPedido(pedido);
  };

  /** Cambios de la solicitud: sobre lo guardado, por si la moza o cocina la tocaron recién. */
  const guardarSolicitud = (cambio: (pedido: Pedido) => Pedido): { pedido?: Pedido; error?: string } => {
    if (!selectedPedido) return { error: 'Elegí una comanda.' };
    const actuales = loadDemoPedidos();
    const guardado = actuales.find(p => p.id === selectedPedido.id);
    if (!guardado || ['cobrado', 'cuenta_corriente', 'cancelado'].includes(guardado.estado)) {
      setPagoError('La comanda ya está cerrada.');
      return { error: 'La comanda ya está cerrada.' };
    }
    try {
      const final = cambio(guardado);
      saveDemoPedidos(actuales.map(p => (p.id === final.id ? final : p)));
      sincronizarEstadoMesa(final.mesa_id);
      setSelectedPedido(final);
      setPagoError('');
      return { pedido: final };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo guardar.';
      setPagoError(mensaje);
      setSelectedPedido(guardado);
      return { error: mensaje };
    }
  };

  /** Ticket para que la moza se lo lleve al cliente. Es el ticket de siempre, sin CAE: la factura se elige al confirmar el pago. */
  const emitirTicketSolicitud = () => {
    if (!selectedPedido || !cobroEnCurso(selectedPedido)) return;
    const actual = loadDemoPedidos().find(p => p.id === selectedPedido.id);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(selectedPedido)) {
      if (actual) setSelectedPedido(actual);
      setPagoError('La comanda cambió. Revisá los importes antes de imprimir.');
      return;
    }
    if (metodoPago === 'mixto') {
      setPagoError('Con pago mixto el ticket sale al confirmar el pago, cuando ya está repartido.');
      return;
    }
    const total = calcTotal();
    const previo: Pago = {
      id: 'ticket-previo',
      pedido_id: actual.id,
      comprador_nombre: selectedCliente?.nombre || getCompradorName(compradorNombre),
      tipo_comprobante: 'ticket',
      metodo_pago: metodoPago,
      monto: total,
      monto_efectivo: 0, monto_transferencia: 0, monto_debito: 0, monto_credito: 0,
      descuento_aplicado: descuento,
      lista_precio_nombre: listaPrecioSeleccionada?.nombre,
      recargo_aplicado: recargo,
      total_cobrado: total,
      vuelto: 0,
      created_at: new Date().toISOString(),
      pedido: actual,
    };
    if (!printTicket(previo)) {
      setPagoError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
      return;
    }
    if (actual.solicitud_cobro?.estado === 'ticket_emitido') return; // Reimpresión: no cambia nada.
    if (guardarSolicitud(p => marcarTicketEmitido(p, { total, descuento, recargo, metodo_pago: metodoPago }, actor)).pedido) {
      setAvisoSolicitud('Ticket impreso. Cuando la moza traiga el pago, confirmalo acá.');
    }
  };

  const confirmarDevolucion = (motivo: string) => {
    if (!devolviendo) return;
    const accion = devolviendo;
    const { pedido: final, error } = guardarSolicitud(p => (accion === 'anular_ticket' ? anularTicket(p, motivo, actor) : rechazarSolicitud(p, motivo, actor)));
    if (!final) { setDevolverError(error || 'No se pudo guardar.'); return; }
    setDevolviendo(null);
    setDevolverError('');
    if (accion === 'rechazar') {
      setSelectedPedido(null);
      setAvisoSolicitud(`${getMesaLabel(final)}: el cobro volvió a la moza para corregirlo.`);
    } else {
      setAvisoSolicitud('Ticket anulado. Ajustá el cobro e imprimí uno nuevo.');
    }
  };

  // Llegó desde el plano de Mesas con "Cobrar": deja esa comanda elegida.
  useEffect(() => {
    if (vista !== 'cobros') return;
    const pedidoId = tomarPedidoACobrar();
    const pedido = pedidoId ? loadDemoPedidos().find(p => p.id === pedidoId && p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado') : undefined;
    if (pedido) setSelectedPedido(pedido);
  }, [vista]);

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
    setClienteError('');
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

    setClienteError('No hay un cliente guardado con ese documento. Completá su nombre para crearlo.');
  };

  const guardarCliente = async () => {
    if (!clienteDraft.nombre.trim()) return;
    setClienteError('');

    const nuevoCliente: ClienteFrecuente = {
      id: nuevoId('cli'),
      ...clienteDraft,
      numero_documento: clienteDraft.numero_documento.trim(),
      nombre: clienteDraft.nombre.trim(),
      telefono: clienteDraft.telefono.trim(),
      domicilio: clienteDraft.domicilio.trim(),
      nota: clienteDraft.nota.trim(),
    };

    try {
      await guardarClienteCuenta(nuevoCliente);
      seleccionarCliente(nuevoCliente);
      setShowClienteForm(false);
    } catch (e) { setClienteError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.'); }
  };

  const updateLastPagoComprobante = (tipo: TipoComprobante) => {
    setLastPago(prev => prev ? { ...prev, tipo_comprobante: tipo } : prev);
    savePagos(pagosRegistrados.map(pago => (
      pago.id === lastPago?.id ? { ...pago, tipo_comprobante: tipo } : pago
    )));
  };

  const printTicket = (pago: Pago): boolean => {
    if (!pago.pedido) return false;

    const items = getActiveItems(pago.pedido);
    const fecha = new Date(pago.created_at);
    const ticketHtml = `
      <!doctype html>
      <html>
        <head>
          <title>Ticket ${getMesaLabel(pago.pedido)}</title>
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
              <p class="title">${readStore<{ nombre?: string }>('restaurant-config-local', {}).nombre || 'Restaurante'}</p>
              <div class="muted">NO VÁLIDO COMO FACTURA</div>
            </div>
            <div class="line"></div>
            <div class="row"><span>Comprobante</span><span>Ticket</span></div>
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
              ${detalleTicket(item.opciones, item.observaciones) ? `<div class="muted" style="font-size:11px;margin:-2px 0 4px 12px">${detalleTicket(item.opciones, item.observaciones)}</div>` : ''}
            `).join('')}
            <div class="line"></div>
            ${pago.descuento_aplicado > 0 ? `<div class="row"><span>Descuento${pago.lista_precio_nombre ? ` (${pago.lista_precio_nombre})` : ''}</span><span>-${formatMoney(pago.descuento_aplicado)}</span></div>` : ''}
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
    if (!printWindow) return false;

    printWindow.document.open();
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    return true;
  };

  /** Manda lo cobrado a sus cuentas: el efectivo al mostrador y lo electrónico al banco. */
  const registrarCobroEnCuentas = (
    pago: Pago,
    breakdown: ReturnType<typeof getPagoBreakdown>,
    signo: 1 | -1
  ) => {
    const referencia = getMesaLabel(pago.pedido);
    const partes: Array<{ cuenta_id: string; monto: number; detalle: string }> = [
      { cuenta_id: cuentaCajaDiaId, monto: breakdown.efectivo, detalle: 'efectivo' },
      { cuenta_id: cuentaBancoId, monto: breakdown.transferencia, detalle: 'transferencia' },
      { cuenta_id: cuentaBancoId, monto: breakdown.tarjeta, detalle: 'tarjeta' },
    ];

    partes
      .filter(parte => parte.monto > 0)
      .forEach(parte => {
        const datos = {
          cuenta_id: parte.cuenta_id,
          monto: parte.monto,
          fecha: todayKey(),
        };
        if (signo === 1) {
          registrarEntradaCuenta({ ...datos, origen: 'venta', descripcion: `Venta ${referencia} - ${parte.detalle}` });
        } else {
          registrarSalidaCuenta({ ...datos, origen: 'ajuste', descripcion: `Anulación de venta ${referencia} - ${parte.detalle}` });
        }
      });

    setCuentasDinero(loadCuentasDinero());
    setMovimientosFinancieros(loadMovimientosFinancieros());
  };

  const procesarCuenta = async () => {
    if (!selectedPedido || cuentaEnProceso.current) return;
    if (!selectedCliente) { setPagoError('Seleccioná un cliente guardado para pasar el consumo a su cuenta.'); return; }
    const sinReceta = productosSinReceta(selectedPedido);
    if (sinReceta.length && !confirmarSinReceta) {
      setPagoError(`Estos productos no descuentan stock: ${sinReceta.map(p => p.nombre).join(', ')}. Confirmá de nuevo para continuar.`);
      setConfirmarSinReceta(true);
      return;
    }
    setConfirmarSinReceta(false);
    cuentaEnProceso.current = true; setGuardandoCuenta(true); setPagoError('');
    try {
      const resultado = await pasarPedidoACuenta({ pedido: selectedPedido, cliente_id: selectedCliente.id,
        descuento, recargo, anticipo: Number(anticipoCuenta), metodo: medioAnticipo,
        responsable: user ? [user.nombre, user.apellido].join(' ').trim() : '' });
      setCuentasDinero(loadCuentasDinero()); setMovimientosFinancieros(loadMovimientosFinancieros());
      setSelectedPedido(null); setACuenta(false); setAnticipoCuenta(''); clearCliente();
      setAvisoCuenta('Consumo registrado a nombre de ' + resultado.cliente.nombre + '. Quedaron ' + formatMoney(resultado.pendiente) + ' a cuenta. Deuda total: ' + formatMoney(resultado.saldo) + '. Stock descontado.');
    } catch (e) { setPagoError(e instanceof Error ? e.message : 'No se pudo registrar el consumo.'); }
    finally { cuentaEnProceso.current = false; setGuardandoCuenta(false); }
  };

  const procesarPago = () => {
    if (!selectedPedido || !cajaAbierta) return;
    const actual = loadDemoPedidos().find(p => p.id === selectedPedido.id);
    if (!actual || ['cobrado', 'cuenta_corriente', 'cancelado'].includes(actual.estado)) { setPagoError('La comanda ya está cerrada.'); return; }
    if (JSON.stringify(actual) !== JSON.stringify(selectedPedido)) { setSelectedPedido(actual); setPagoError('La comanda cambió. Revisá los importes antes de cobrar.'); return; }
    if (!loadCajasDiarias().some(caja => caja.id === cajaAbierta.id && caja.estado === 'abierta')) { setPagoError('La caja ya está cerrada.'); return; }
    if (!(actual.items || []).some(item => item.estado !== 'cancelado')) { setPagoError('La comanda no tiene productos para cobrar.'); return; }
    // Si salió de una solicitud, el id del cobro es fijo: confirmarlo dos veces no lo duplica.
    const solicitud = cobroEnCurso(actual) ? actual.solicitud_cobro : undefined;
    const pagoId = solicitud ? pagoIdDeSolicitud(solicitud) : nuevoId('pago');
    if (loadPagos().some(p => p.id === pagoId || p.pedido_id === actual.id)) {
      setPagoError('Esta comanda ya tiene un cobro registrado. Revisá los últimos pagos antes de cobrar de nuevo.');
      return;
    }
    const total = calcTotal();
    const ticket = importeFijado(actual);
    if (ticket && (Math.abs(ticket.total - total) > 0.009 || ticket.metodo_pago !== metodoPago)) {
      setPagoError(`El ticket impreso dice ${nombreMedio(ticket.metodo_pago)} por ${formatMoney(ticket.total)}. Para cobrar otra cosa, primero anulá el ticket.`);
      return;
    }
    const mixtoEfectivo = parseFloat(montoMixtoEfectivo) || 0;
    const mixtoTransferencia = parseFloat(montoMixtoTransferencia) || 0;
    const mixtoDebito = parseFloat(montoMixtoDebito) || 0;
    const mixtoCredito = parseFloat(montoMixtoCredito) || 0;
    const totalMixto = mixtoEfectivo + mixtoTransferencia + mixtoDebito + mixtoCredito;
    if (![total, descuento, recargo].every(valor => Number.isFinite(valor) && valor >= 0)
      || (metodoPago === 'mixto' && ![mixtoEfectivo, mixtoTransferencia, mixtoDebito, mixtoCredito].every(valor => Number.isFinite(valor) && valor >= 0))) {
      setPagoError('Revisá los importes: no pueden ser negativos ni inválidos.');
      return;
    }
    const cantidadMetodosMixtos = [mixtoEfectivo, mixtoTransferencia, mixtoDebito, mixtoCredito].filter(valor => valor > 0).length;
    if (metodoPago === 'mixto' && (Math.abs(totalMixto - total) > 0.009 || cantidadMetodosMixtos < 2)) {
      setPagoError(`Distribuí el total de $${total.toLocaleString()} entre por lo menos dos medios de pago.`);
      return;
    }
    if (metodoPago === 'efectivo' && montoEfectivo.trim() !== '' && (!Number.isFinite(Number(montoEfectivo)) || Number(montoEfectivo) < total)) {
      setPagoError('El monto recibido en efectivo no alcanza para completar el cobro.');
      return;
    }
    const sinReceta = productosSinReceta(selectedPedido);
    if (sinReceta.length && !confirmarSinReceta) {
      setPagoError(`Estos productos no descuentan stock: ${sinReceta.map(p => p.nombre).join(', ')}. Confirmá de nuevo para continuar.`);
      setConfirmarSinReceta(true);
      return;
    }
    setConfirmarSinReceta(false);
    setPagoError('');
    if (cobroEnProceso.current) return;
    cobroEnProceso.current = true;
    const pedidoCobrado = selectedPedido;
    const pago: Pago = {
      id: pagoId,
      pedido_id: pedidoCobrado.id,
      cajero_id: user?.id,
      comprador_nombre: selectedCliente?.nombre || getCompradorName(compradorNombre),
      tipo_comprobante: 'ticket',
      metodo_pago: metodoPago,
      monto: total,
      monto_efectivo: metodoPago === 'efectivo' ? total : metodoPago === 'mixto' ? mixtoEfectivo : 0,
      monto_transferencia: metodoPago === 'transferencia' || metodoPago === 'mercado_pago' ? total : metodoPago === 'mixto' ? mixtoTransferencia : 0,
      monto_tarjeta: metodoPago === 'tarjeta' ? total : 0,
      monto_debito: metodoPago === 'debito' ? total : metodoPago === 'mixto' ? mixtoDebito : 0,
      monto_credito: metodoPago === 'credito' ? total : metodoPago === 'mixto' ? mixtoCredito : 0,
      descuento_aplicado: descuento,
      lista_precio_id: listaPrecioSeleccionada?.id,
      lista_precio_nombre: listaPrecioSeleccionada?.nombre,
      recargo_aplicado: recargo,
      total_cobrado: total,
      vuelto: metodoPago === 'efectivo' ? calcVuelto() : 0,
      created_at: new Date().toISOString(),
      pedido: pedidoCobrado,
    };
    const breakdown = getPagoBreakdown(pago);
    try {
      withStoreTransaction(() => {
        savePagos([pago, ...loadPagos()]);
        const pedidoCerrado: Pedido = marcarPagada({
          ...pedidoCobrado,
          estado: 'cobrado',
          total, descuento, recargo,
          hora_cierre: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, pago.id, actor);
        saveDemoPedidos(loadDemoPedidos().map(pedido => pedido.id === pedidoCerrado.id ? pedidoCerrado : pedido));
        sincronizarEstadoMesa(pedidoCerrado.mesa_id);
        descontarStockPorVenta(pedidoCerrado);
        saveCajasDiarias(loadCajasDiarias().map(caja => (
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
        registrarCobroEnCuentas(pago, breakdown, 1);
      });
    } catch (error) {
      setPagoError(error instanceof Error ? error.message : 'No se pudo guardar el cobro.');
      cobroEnProceso.current = false;
      return;
    }
    setLastPago(pago);
    setReceptor(receptorDesdeCliente(selectedCliente, compradorNombre));
    setFactura(null);
    setFacturaError('');
    setTicketError('');
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
    cobroEnProceso.current = false;
  };

  /** Cierra la venta: el cobro ya quedó registrado y el stock descontado. */
  const finalizarVenta = () => {
    setLastPago(null);
    setShowTicket(false);
    setTicketError('');
    setFactura(null);
    setFacturaError('');
  };

  const eligioFactura = lastPago?.tipo_comprobante === 'factura';
  const letraFactura = configFiscal ? letraSegunCondicion(configFiscal.condicion_emisor, receptor.condicion_iva) : '';

  const emitirDelCobro = async (pago: Pago): Promise<ComprobanteFiscal | null> => {
    if (factura?.estado === 'autorizado') return factura;
    const nombreCliente = receptor.nombre.trim();
    if (receptor.condicion_iva !== 5 && (!nombreCliente || nombreCliente === 'Consumidor final')) {
      setFacturaError('Cargá el nombre o la razón social del cliente.');
      return null;
    }
    setEmitiendo(true);
    setFacturaError('');
    try {
      const comprobante = await emitirFactura(pago.id, pago.total_cobrado, receptor);
      setFactura(comprobante);
      if (comprobante.estado === 'pendiente') setFacturaError(`Quedó pendiente: ${comprobante.error || 'ARCA no respondió.'} Podés reintentar o resolverlo después en Facturas.`);
      if (comprobante.estado === 'rechazado') setFacturaError(`ARCA la rechazó: ${comprobante.error || 'sin motivo.'} Corregí los datos y reintentá, o resolvelo después en Facturas.`);
      return comprobante;
    } catch (error) {
      setFacturaError(error instanceof Error ? error.message : 'No se pudo emitir la factura.');
      return null;
    } finally {
      setEmitiendo(false);
    }
  };

  const imprimirYFinalizar = async () => {
    if (!lastPago) return;
    if (eligioFactura) {
      const ventana = abrirVentanaTicket();
      if (!ventana) {
        setTicketError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
        return;
      }
      const comprobante = await emitirDelCobro(lastPago);
      if (comprobante?.estado !== 'autorizado') {
        ventana.close();
        return;
      }
      const lineas = lineasPorCategoria(lastPago.pedido?.items || [], Number(comprobante.total), loadProductos(), loadCategorias());
      await imprimirComprobanteFiscal(ventana, comprobante, lineas);
      finalizarVenta();
      return;
    }
    if (!printTicket(lastPago)) {
      setTicketError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
      return;
    }
    finalizarVenta();
  };

  /** El ticket con el detalle para el cliente: no finaliza, así también se puede imprimir la factura. */
  const imprimirTicketCliente = () => {
    if (lastPago && !printTicket(lastPago)) {
      setTicketError('No pude abrir la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentar.');
    }
  };

  /** Si la factura ya quedó pendiente o rechazada, se cierra igual y sigue en Ventas → Facturas. */
  const finalizarSinImprimir = async () => {
    if (lastPago && eligioFactura && !factura) {
      const comprobante = await emitirDelCobro(lastPago);
      if (comprobante?.estado !== 'autorizado') return;
    }
    finalizarVenta();
  };

  /** Lo autorizado por ARCA no se borra: se anula con nota de crédito. Devuelve false si no se pudo. */
  const anularFactura = async () => {
    if (!factura) return true;
    setEmitiendo(true);
    setFacturaError('');
    try {
      let actual = factura;
      if (actual.estado === 'pendiente') {
        actual = await reintentarComprobante(actual.id);
        setFactura(actual);
      }
      if (actual.estado === 'pendiente') {
        setFacturaError('ARCA todavía no respondió por esta factura. No se puede anular el cobro hasta saber si se autorizó.');
        return false;
      }
      if (actual.estado === 'rechazado') {
        await descartarComprobante(actual.id);
        return true;
      }
      const nota = await emitirNotaCredito(actual.id);
      if (nota.estado !== 'autorizado') {
        setFacturaError(`No se pudo emitir la nota de crédito: ${nota.error || 'sin respuesta de ARCA.'} El cobro sigue registrado.`);
        return false;
      }
      return true;
    } catch (error) {
      setFacturaError(error instanceof Error ? error.message : 'No se pudo anular la factura.');
      return false;
    } finally {
      setEmitiendo(false);
    }
  };

  const cancelarComprobante = async () => {
    if (!await anularFactura()) return;
    setFactura(null);
    setFacturaError('');
    if (lastPago?.pedido) {
      const breakdown = getPagoBreakdown(lastPago);
      registrarCobroEnCuentas(lastPago, breakdown, -1);
      // Vuelve como estaba antes de cobrar (entregada, con su solicitud), con la anulación anotada.
      const previo = lastPago.pedido;
      const pedidoRestaurado: Pedido = conEvento(
        { ...previo, estado: previo.estado === 'cobrado' ? 'entregado' : previo.estado, hora_cierre: undefined, updated_at: new Date().toISOString() },
        actor, 'pago_anulado', formatMoney(lastPago.total_cobrado),
      );
      reponerStockPorVenta(pedidoRestaurado);
      saveDemoPedidos(loadDemoPedidos().map(pedido => pedido.id === pedidoRestaurado.id ? pedidoRestaurado : pedido));
      sincronizarEstadoMesa(pedidoRestaurado.mesa_id);
      setPedidos(prev => prev.some(pedido => pedido.id === pedidoRestaurado.id) ? prev : [pedidoRestaurado, ...prev]);
      setSelectedPedido(pedidoRestaurado);
      savePagos(pagosRegistrados.filter(pago => pago.id !== lastPago.id));
      saveCajasDiarias(cajas.map(caja => (
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
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_auto] gap-2">
          <input
            value={nuevoApartadoNombre}
            onChange={e => setNuevoApartadoNombre(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            placeholder="Ej: sobre oficina, vuelto, pago a proveedor"
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
            <div key={apartado.id} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-2 items-center bg-slate-50 border border-slate-100 rounded-xl p-3">
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

        {!cierreACiegas && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
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
        </div>}
      </div>
    </div>
  );

  const renderArqueos = () => (
    <>
      {renderApartadosCaja()}
      {!cierreACiegas && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Saldos por cuenta</h3>
            <p className="text-sm text-slate-500">La caja del día es el efectivo del mostrador de hoy; la caja grande es el acumulado.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            {cuentasDinero.filter(cuenta => cuenta.activa).map(cuenta => (
              <div
                key={cuenta.id}
                className={`rounded-xl border p-3 ${cuenta.id === cuentaCajaDiaId ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}
              >
                <p className={`text-xs ${cuenta.id === cuentaCajaDiaId ? 'text-emerald-700' : 'text-slate-500'}`}>{cuenta.nombre}</p>
                <p className={`text-lg font-bold ${cuenta.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatMoney(cuenta.saldo)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {cuenta.id === cuentaCajaDiaId
                    ? 'Solo hoy'
                    : cuenta.id === cuentaCajaGrandeId
                      ? 'Acumulado'
                      : cuenta.tipo.replace('_', ' ')}
                </p>
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
      </div>}
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
              {!cierreACiegas && <>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Inicial</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Efectivo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Tarjeta</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Transferencia</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Total</th>
              </>}
              <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {historialCajas.map(caja => (
              <tr
                key={caja.id}
                onClick={() => setArqueoAbierto(caja)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setArqueoAbierto(caja); } }}
                tabIndex={0}
                title="Ver el detalle del arqueo"
                className="cursor-pointer hover:bg-amber-50/60 focus:bg-amber-50 focus:outline-none"
              >
                <td className="py-3 px-4 text-sm font-medium text-slate-700">
                  {new Date(`${caja.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                  {caja.estado === 'cerrada' && caja.cerrado_por_nombre && (
                    <span className="block text-xs font-normal text-slate-400">
                      Cerró {caja.cerrado_por_nombre}
                    </span>
                  )}
                </td>
                {!cierreACiegas && <>
                  <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.monto_inicial)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.efectivo)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.tarjeta)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatMoney(caja.transferencia)}</td>
                  <td className="py-3 px-4 text-sm font-bold text-right">{formatMoney(caja.total_ventas)}</td>
                </>}
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
                <td colSpan={cierreACiegas ? 2 : 7} className="py-8 text-center text-sm text-slate-400">Todavía no hay arqueos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {historialCajas.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Tocá un día para ver quién cerró, con cuánto y todo lo que pasó en esa caja.</p>
      )}
    </div>
    {arqueoAbierto && (
      <DetalleArqueo
        caja={cajas.find(caja => caja.id === arqueoAbierto.id) || arqueoAbierto}
        pagos={pagosRegistrados}
        movimientos={movimientosFinancieros}
        apartados={apartadosCaja}
        cuentas={cuentasDinero}
        aCiegas={cierreACiegas}
        onClose={() => setArqueoAbierto(null)}
      />
    )}
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
            {user?.rol === 'cajero' ? ' Hasta abrirla no se pueden cobrar mesas.' : ''}
          </p>
          {mensajeCierre && (
            <p role="status" className={`mt-4 text-sm rounded-xl px-3 py-2 ${mensajeCierreError ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {mensajeCierre}
            </p>
          )}

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
          {aperturaError && <p role="alert" className="mt-3 text-sm text-red-600">{aperturaError}</p>}
        </div>

      </div>
    );
  }

  return (
    <div className={vista === 'caja' ? 'space-y-6' : 'flex flex-col xl:flex-row gap-4 xl:gap-6 h-full'}>
      <div className={vista === 'caja' ? 'space-y-4' : 'w-full xl:w-72 flex-shrink-0 space-y-4'}>
        {avisoCuenta && <p role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">{avisoCuenta}</p>}
        {avisoSolicitud && <p role="status" className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">{avisoSolicitud}</p>}
        {verTotalesCaja && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
          <p>Ventas a cuenta: <strong>{formatMoney(cajaAbierta.ventas_cuenta_corriente || 0)}</strong></p>
          <p>Cobros de cuenta corriente: <strong>{formatMoney(cajaAbierta.cobros_cuenta_corriente || 0)}</strong></p>
          <p className="text-xs text-slate-500">Los cobros de deudas ingresan a caja sin sumar otra venta.</p>
        </div>}
        {verTotalesCaja && <div className="grid grid-cols-2 gap-3">
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
        </div>}

        {vista === 'caja' && (
          <button
            onClick={() => { setCierreError(''); setShowCierreCaja(true); }}
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              Por cobrar
              {solicitudesActivas > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-white animate-pulse">
                  <BellRing size={11} />{solicitudesActivas === 1 ? '1 solicitud' : `${solicitudesActivas} solicitudes`}
                </span>
              )}
            </p>
            <button title="Actualizar mesas" onClick={() => setPedidos(loadDemoPedidos().filter(p => p.estado !== 'cobrado' && p.estado !== 'cuenta_corriente' && p.estado !== 'cancelado'))} className="text-slate-400 hover:text-amber-600"><RefreshCw size={14} /></button>
          </div>
          <div className="divide-y divide-slate-50">
            {pedidosPorCobrar.map(pedido => (
              <button
                key={pedido.id}
                onClick={() => selectPedido(pedido)}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-colors ${selectedPedido?.id === pedido.id ? 'bg-amber-50 border-l-2 border-amber-500' : cobroEnCurso(pedido) ? 'bg-amber-50/40 border-l-2 border-amber-300' : ''}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold text-slate-800 text-sm">{getMesaLabel(pedido)}</span>
                  {pedido.solicitud_cobro ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${estadoCobroConfig[estadoCobro(pedido)].clase}`}>
                      {estadoCobroConfig[estadoCobro(pedido)].label}
                    </span>
                  ) : (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      {pedido.estado === 'entregado' ? 'Por cobrar' : pedido.estado}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {pedido.empleado?.nombre}
                  {cobroEnCurso(pedido) && pedido.solicitud_cobro && ` · ${nombreMedio(pedido.solicitud_cobro.metodo_pago)} · ${new Date(pedido.solicitud_cobro.solicitada_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">{pedido.items?.length} items</span>
                  <span className="text-sm font-bold text-slate-800">${pedido.total.toLocaleString()}</span>
                </div>
              </button>
            ))}
            {pedidosPorCobrar.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No hay pedidos por cobrar</div>
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
                  <p className="text-sm text-slate-500">
                    {canalDe(selectedPedido) === 'salon'
                      ? `${selectedPedido.empleado?.nombre || 'Sin moza'} · ${selectedPedido.cantidad_personas} personas`
                      : [selectedPedido.cliente_telefono, selectedPedido.direccion_entrega, selectedPedido.costo_envio ? `Envío $${selectedPedido.costo_envio.toLocaleString('es-AR')}` : ''].filter(Boolean).join(' · ') || nombresCanal[canalDe(selectedPedido)]}
                  </p>
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
              {selectedPedido.solicitud_cobro && cobroEnCurso(selectedPedido) && (() => {
                const solicitud = selectedPedido.solicitud_cobro;
                if (!solicitud) return null;
                const estado = estadoCobro(selectedPedido);
                return (
                  <div className={`mb-6 rounded-2xl border p-4 ${estadoCobroConfig[estado].clase}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-semibold"><BellRing size={16} />{estadoCobroConfig[estado].label}</p>
                      <span className="text-xs font-mono opacity-80">#{solicitud.id.replace(/^sol-/, '').slice(0, 8).toUpperCase()}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <dt className="opacity-75">Moza</dt><dd className="text-right font-medium">{solicitud.solicitada_por_nombre}</dd>
                      <dt className="opacity-75">Medio elegido</dt><dd className="text-right font-medium">{nombreMedio(solicitud.metodo_pago)}</dd>
                      {solicitud.metodo_pago === 'mixto' && solicitud.reparto && (<>
                        <dt className="opacity-75">Cómo paga</dt>
                        <dd className="text-right font-medium">{describirReparto(solicitud.reparto)}</dd>
                      </>)}
                      <dt className="opacity-75">Pedido a las</dt>
                      <dd className="text-right font-medium">{new Date(solicitud.solicitada_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</dd>
                      <dt className="opacity-75">Importe pedido</dt><dd className="text-right font-bold">{formatMoney(solicitud.total)}</dd>
                      {solicitud.ticket && (<>
                        <dt className="opacity-75">Ticket impreso</dt>
                        <dd className="text-right font-bold">{formatMoney(solicitud.ticket.total)} · {nombreMedio(solicitud.ticket.metodo_pago)}</dd>
                      </>)}
                    </dl>
                    {solicitudDesactualizada(selectedPedido) && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-white/70 p-2 text-xs font-medium text-red-700">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        La comanda ya no suma lo que se pidió cobrar ({formatMoney(selectedPedido.total)}). Devolvela a la moza para que la revise.
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={emitirTicketSolicitud}
                        disabled={solicitudDesactualizada(selectedPedido)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        <Printer size={15} />{estado === 'ticket_emitido' ? 'Reimprimir ticket' : 'Imprimir ticket'}
                      </button>
                      {estado === 'ticket_emitido' ? (
                        <button
                          type="button"
                          onClick={() => { setDevolviendo('anular_ticket'); setDevolverError(''); }}
                          className="flex items-center justify-center gap-2 rounded-xl border border-current bg-white/60 px-3 py-2.5 text-sm font-semibold hover:bg-white"
                        >
                          <Undo2 size={15} />Anular ticket
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setDevolviendo('rechazar'); setDevolverError(''); }}
                          className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Undo2 size={15} />Devolver a la moza
                        </button>
                      )}
                    </div>
                    {estado === 'ticket_emitido' && (
                      <button
                        type="button"
                        onClick={() => { setDevolviendo('rechazar'); setDevolverError(''); }}
                        className="mt-2 w-full text-xs font-medium text-red-700 hover:underline"
                      >
                        Anular el ticket y devolver la comanda a la moza
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="space-y-2 mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Detalle del pedido</h4>
                {getActiveItems(selectedPedido).map(item => (
                  <div key={item.id} className="flex justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="text-slate-600">{item.cantidad}x {item.producto?.nombre}</span>
                      {/* Lo mismo que ve cocina: cuánto lleva desde que se pidió, o cuánto tardó en salir. */}
                      <RelojItem item={item} className="ml-2 align-middle" />
                      <DetalleItem opciones={item.opciones} observaciones={item.observaciones} />
                    </div>
                    <span className="font-medium text-slate-800 shrink-0">${item.subtotal.toLocaleString()}</span>
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
                    disabled={Boolean(fijado)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-emerald-600"
                    placeholder="0"
                    min="0"
                    max={selectedPedido.subtotal}
                  />
                </div>
                {listaPrecioSeleccionada && (
                  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                    listaPrecioSeleccionada.tipo_ajuste === 'recargo'
                      ? 'border-orange-100 bg-orange-50'
                      : 'border-emerald-100 bg-emerald-50'
                  }`}>
                    <div>
                      <p className={`text-xs font-semibold ${listaPrecioSeleccionada.tipo_ajuste === 'recargo' ? 'text-orange-700' : 'text-emerald-700'}`}>
                        Lista aplicada: {listaPrecioSeleccionada.nombre}
                      </p>
                      <p className={`text-xs ${listaPrecioSeleccionada.tipo_ajuste === 'recargo' ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {listaPrecioSeleccionada.tipo_ajuste === 'recargo' ? 'Interés / recargo' : 'Descuento'} calculado: ${montoAjusteLista.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {(
                      listaPrecioSeleccionada.tipo_ajuste === 'recargo'
                        ? Math.abs(recargo - montoAjusteLista) > 0.009 || descuento > 0
                        : Math.abs(descuento - montoAjusteLista) > 0.009 || recargo > 0
                    ) && (
                      <button
                        onClick={() => {
                          setDescuento(listaPrecioSeleccionada.tipo_ajuste === 'descuento' ? montoAjusteLista : 0);
                          setRecargo(listaPrecioSeleccionada.tipo_ajuste === 'recargo' ? montoAjusteLista : 0);
                        }}
                        className={`text-xs font-semibold whitespace-nowrap ${listaPrecioSeleccionada.tipo_ajuste === 'recargo' ? 'text-orange-700 hover:text-orange-800' : 'text-emerald-700 hover:text-emerald-800'}`}
                      >
                        Restablecer automático
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 w-24">Recargo $</label>
                  <input
                    type="number"
                    value={recargo || ''}
                    onChange={e => setRecargo(parseFloat(e.target.value) || 0)}
                    disabled={Boolean(fijado)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400 text-orange-600"
                    placeholder="0"
                    min="0"
                  />
                </div>
                {fijado && <p className="text-xs text-blue-700">Importe fijado por el ticket impreso. Para cambiarlo, anulá el ticket.</p>}
                <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t border-slate-200">
                  <span>TOTAL</span>
                  <span className="text-amber-600">${calcTotal().toLocaleString()}</span>
                </div>
              </div>

              {!aCuenta && (
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
                      {clientesFiltrados.slice(0, 8).map(cliente => (
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
              )}

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Método de pago</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(Object.keys(metodosConfig) as MetodoPago[]).map(met => (
                    <button
                      key={met}
                      onClick={() => { setACuenta(false); setMetodoPago(met); setPagoError(''); }}
                      disabled={Boolean(fijado) && fijado?.metodo_pago !== met}
                      className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        !aCuenta && metodoPago === met
                          ? metodosConfig[met].color + ' border-current shadow-sm'
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {metodosConfig[met].label}
                    </button>
                  ))}
                </div>

                <button onClick={() => { setACuenta(true); setPagoError(''); }} className={aCuenta ? 'w-full mb-3 py-3 px-4 rounded-xl border-2 font-semibold bg-amber-50 border-amber-500 text-amber-800' : 'w-full mb-3 py-3 px-4 rounded-xl border-2 font-semibold border-slate-200 text-slate-600 hover:border-amber-400'}>
                  Pasar a cuenta corriente
                </button>
                {aCuenta && <div className="p-4 mb-3 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-amber-900">El consumo descuenta stock y cierra la comanda. El importe pendiente se agrega a la deuda del cliente.</p>
                    <button
                      onClick={openClienteForm}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5"
                    >
                      <Plus size={13} />
                      Nueva cuenta
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1.5">Cuenta corriente</label>
                    <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                      <Search size={15} className="text-amber-700/70" />
                      <input
                        value={clienteBusqueda}
                        onChange={e => {
                          setClienteBusqueda(e.target.value);
                          setSelectedCliente(null);
                          setCompradorNombre(e.target.value);
                          setPagoError('');
                        }}
                        className="flex-1 text-sm outline-none bg-transparent"
                        placeholder="Buscar por nombre, DNI o teléfono"
                      />
                      {clienteBusqueda && (
                        <button onClick={clearCliente} className="text-slate-400 hover:text-slate-600" aria-label="Limpiar búsqueda">
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {!selectedCliente && (
                      <div className="mt-2 bg-white border border-amber-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                        {clientesFiltrados.slice(0, 12).map(cliente => {
                          const deuda = saldoCliente(cliente.id, movimientosCuenta);
                          return (
                            <button
                              key={cliente.id}
                              onClick={() => { seleccionarCliente(cliente); setPagoError(''); }}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-amber-50 border-b border-slate-50 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{cliente.nombre}</p>
                                <p className="text-xs text-slate-400 truncate">
                                  {[cliente.telefono || 'Sin teléfono', cliente.numero_documento ? `${cliente.tipo_documento} ${cliente.numero_documento}` : null].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <span className={`text-xs font-bold shrink-0 ${deuda > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                                {deuda > 0 ? `Debe ${formatMoney(deuda)}` : 'Al día'}
                              </span>
                            </button>
                          );
                        })}
                        {clientesFiltrados.length === 0 && (
                          <div className="px-3 py-3 text-sm text-slate-500">
                            {clientes.length === 0
                              ? 'Todavía no hay cuentas. Tocá “Nueva cuenta” para crear la primera.'
                              : 'No hay una cuenta con esa búsqueda. Tocá “Nueva cuenta” para agregarla.'}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedCliente && (
                      <div className="mt-2 bg-white border border-emerald-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{selectedCliente.nombre}</p>
                            <p className="text-xs text-slate-500">
                              {[selectedCliente.telefono || 'Sin teléfono', selectedCliente.numero_documento ? `${selectedCliente.tipo_documento} ${selectedCliente.numero_documento}` : null].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-sm text-amber-900 mt-1">
                              Deuda actual: <strong>{formatMoney(saldoCliente(selectedCliente.id, movimientosCuenta))}</strong>
                            </p>
                          </div>
                          <button onClick={clearCliente} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                            Cambiar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="block text-sm text-slate-700">Paga ahora $ (opcional)
                    <input aria-label="Pago inicial" type="number" min="0" step="0.01" value={anticipoCuenta} onChange={e => setAnticipoCuenta(e.target.value)} placeholder="0" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 outline-none bg-white" />
                  </label>
                  {Number(anticipoCuenta) > 0 && <label className="block text-sm text-slate-700">Medio del pago inicial
                    <select value={medioAnticipo} onChange={e => setMedioAnticipo(e.target.value as MedioCobroCuenta)} className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 bg-white">{Object.entries(mediosCobroCuenta).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  </label>}
                  <p className="font-bold text-amber-900">Queda a cuenta: {formatMoney(Math.max(0, calcTotal() - (Number(anticipoCuenta) || 0)))}</p>
                </div>}
                {!aCuenta && metodoPago === 'efectivo' && (
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

                {!aCuenta && metodoPago === 'mixto' && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-700">Distribuir el pago</p>
                      <p className="text-xs text-slate-500">Usá dos o más medios. En pagos mixtos el descuento se ajusta manualmente.</p>
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

                {!aCuenta && montoEfectivo && calcVuelto() > 0 && (
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
                onClick={aCuenta ? procesarCuenta : procesarPago}
                disabled={guardandoCuenta}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 text-lg transition-all shadow-lg shadow-emerald-500/30"
              >
                <Check size={22} />
                {guardandoCuenta ? 'Guardando…' : aCuenta ? 'Confirmar consumo a cuenta' : cobroEnCurso(selectedPedido) ? `Confirmar pago recibido $${calcTotal().toLocaleString()}` : `Cobrar ${calcTotal().toLocaleString()}`}
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

      {devolviendo && (
        <PedirMotivo
          titulo={devolviendo === 'anular_ticket' ? 'Anular ticket' : 'Devolver el cobro a la moza'}
          descripcion={devolviendo === 'anular_ticket'
            ? 'El ticket impreso deja de valer y la solicitud vuelve a quedar pendiente en caja para ajustarla.'
            : 'La comanda vuelve a la moza para que la corrija y pida el cobro de nuevo. Queda registrado el motivo.'}
          placeholder={devolviendo === 'anular_ticket' ? 'Ej: paga con tarjeta, se aplica descuento…' : 'Ej: falta cargar una bebida, cobran por separado…'}
          textoConfirmar={devolviendo === 'anular_ticket' ? 'Anular ticket' : 'Devolver'}
          error={devolverError}
          onCerrar={() => setDevolviendo(null)}
          onConfirmar={confirmarDevolucion}
        />
      )}

      {showCierreCaja && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Arqueo de cierre</h3>
                <p className="text-sm text-slate-500">{new Date(`${cajaAbierta.fecha}T00:00:00`).toLocaleDateString('es-AR')}</p>
              </div>
              <button onClick={() => { if (!cerrandoCaja) setShowCierreCaja(false); }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!cierreACiegas && (
                <>
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Gastos de la caja del día</p>
                    <p className="text-lg font-bold text-slate-800">{formatMoney(totalGastosCajaHoy)}</p>
                    <p className="text-xs text-slate-400 mt-1">Solo el efectivo salido del cajón. Ya está descontado del esperado.</p>
                  </div>
                </>
              )}

              {([
                ['Efectivo en la caja', montoCierreEfectivo, setMontoCierreEfectivo, cajaAbierta.monto_esperado_efectivo, 'Contá los billetes del cajón. Las transferencias y tarjetas no hace falta contarlas.'],
              ] as Array<[string, string, (value: string) => void, number, string]>).map(([etiqueta, valor, setValor, esperado, ayuda]) => {
                const contado = montoContado(valor);
                const diferencia = contado === null ? null : contado - esperado;
                return (
                  <div key={etiqueta}>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{etiqueta}</label>
                    <input
                      type="number"
                      value={valor}
                      onChange={e => { setValor(e.target.value); setCierreError(''); }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                      placeholder={cierreACiegas ? '' : String(esperado)}
                      min="0"
                    />
                    {!cierreACiegas && ayuda && <p className="text-xs text-slate-400 mt-1.5">{ayuda}</p>}
                    {!cierreACiegas && diferencia !== null && (
                      <div className="mt-2 flex justify-between rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
                        <span className="text-slate-500">Diferencia</span>
                        <span className={`font-bold ${diferencia === 0 ? 'text-emerald-600' : diferencia < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                          {formatMoney(diferencia)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {cierreError && <p role="alert" className="text-sm font-medium text-red-700">{cierreError}</p>}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => { if (!cerrandoCaja) setShowCierreCaja(false); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={cerrarCaja}
                disabled={cerrandoCaja}
                className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Lock size={15} />
                {cerrandoCaja ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClienteForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Agregar cliente</h3>
                {clienteError && <p role="alert" className="text-sm text-red-600">{clienteError}</p>}
                <p className="text-sm text-slate-500">Buscá por documento y completá los datos del comprador.</p>
              </div>
              <button onClick={() => setShowClienteForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Buscá entre los clientes guardados. Para crear uno nuevo alcanza con su nombre; el documento es opcional.
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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
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
                  {(configFiscal ? ['ticket', 'factura'] as TipoComprobante[] : ['ticket'] as TipoComprobante[]).map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => updateLastPagoComprobante(tipo)}
                      disabled={emitiendo || Boolean(factura && factura.estado !== 'rechazado')}
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
                {eligioFactura && (!factura || factura.estado === 'rechazado') && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label htmlFor="factura-condicion" className="block text-xs font-medium text-slate-600 mb-1">Condición de IVA</label>
                      <select
                        id="factura-condicion"
                        value={receptor.condicion_iva}
                        onChange={e => setReceptor(prev => ({ ...prev, condicion_iva: Number(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                      >
                        {condicionesIva.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="factura-documento" className="block text-xs font-medium text-slate-600 mb-1">CUIT o DNI</label>
                      <input
                        id="factura-documento"
                        value={receptor.doc_nro === '0' ? '' : receptor.doc_nro}
                        onChange={e => setReceptor(prev => armarReceptor(prev.nombre, prev.condicion_iva, e.target.value))}
                        placeholder={letraFactura === 'A' ? 'CUIT obligatorio' : 'Opcional'}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                      />
                    </div>
                    {receptor.condicion_iva !== 5 && (
                      <div className="col-span-2">
                        <label htmlFor="factura-nombre" className="block text-xs font-medium text-slate-600 mb-1">Nombre o razón social del cliente</label>
                        <input
                          id="factura-nombre"
                          value={receptor.nombre === 'Consumidor final' ? '' : receptor.nombre}
                          onChange={e => setReceptor(prev => ({ ...prev, nombre: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        />
                      </div>
                    )}
                    <p className="col-span-2 text-sm font-semibold text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Se va a emitir: Factura {letraFactura}</p>
                  </div>
                )}
                {factura?.estado === 'autorizado' && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-3">
                    {nombreComprobante(factura)} {numeroComprobante(factura)} · CAE {factura.cae}
                  </p>
                )}
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

            <div className="p-6 space-y-3">
              {ticketError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{ticketError}</p>
              )}
              {facturaError && (
                <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{facturaError}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => void imprimirYFinalizar()}
                  disabled={emitiendo}
                  className="flex-1 py-2.5 bg-emerald-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors"
                >
                  <Printer size={14} />
                  {emitiendo ? 'Enviando a ARCA…' : factura && factura.estado !== 'autorizado' ? 'Reintentar e imprimir' : eligioFactura ? 'Imprimir factura ARCA y finalizar' : 'Imprimir y finalizar'}
                </button>
                <button
                  onClick={() => void finalizarSinImprimir()}
                  disabled={emitiendo}
                  className="flex-1 py-2.5 border border-slate-200 disabled:opacity-60 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  {factura && factura.estado !== 'autorizado' ? 'Finalizar y facturar después' : 'Finalizar sin imprimir'}
                </button>
              </div>
              {eligioFactura && (
                <button
                  onClick={imprimirTicketCliente}
                  disabled={emitiendo}
                  className="w-full py-2.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Printer size={14} />
                  Imprimir ticket del cliente (con productos)
                </button>
              )}
              <button
                onClick={() => void cancelarComprobante()}
                disabled={emitiendo}
                className="w-full py-2 text-xs font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-60"
              >
                {factura && factura.estado !== 'rechazado' ? 'Anular con nota de crédito y devolver el stock' : 'Anular cobro y devolver el stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
