import { useEffect, useMemo, useState } from 'react';
import { Plus, ReceiptText, Wallet, CalendarDays, Trash2, Pencil, History, X, Check, ArrowLeft, ArrowLeftRight, Landmark, Smartphone, CreditCard, Banknote, Clock } from 'lucide-react';
import type { AlcanceGasto, CategoriaGasto, CuentaDinero, Gasto, MetodoPago, PageId, Proveedor, TipoCuentaDinero } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import {
  cuentaBancoId,
  cuentaCajaDiaId,
  cuentaCajaGrandeId,
  loadCuentasDinero,
  mensajeGastoSinEfectivo,
  loadMovimientosFinancieros,
  registrarEntradaCuenta,
  saveCuentasDinero,
  transferirEntreCuentas,
} from '../lib/finance';
import { loadProveedores } from '../lib/proveedoresStore';
import { dayKey } from '../lib/fechas';
import { loadGastos, saveGastos, useGastos } from '../lib/gastosStore';
import { aplicarGastoEnCajaDia, efectivoEnCajaAbierta, useCajas } from '../lib/cajaStore';
import { nuevoId } from '../lib/ids';
import { withStoreTransaction } from '../lib/storeSync';
import { cajaAbiertaActual, efectivoGastadoDeLaCaja, recalcularEsperadoEfectivo } from '../lib/esperadoCaja';
import { useUsuarios } from '../lib/usuariosStore';
import { SueldosDelMes } from '../components/Sueldos';
import { gastosRecuperables } from '../lib/gastosRecuperables';
import { efectivoDelCajon, nombreUsuario, periodoActual, registrarGasto } from '../lib/sueldos';
import { useFichadas } from '../lib/fichadas';
import { RevisionArqueosCajaGrande } from '../components/RevisionArqueosCajaGrande';
import { esAjustePorConteo, esCorreccionArqueo } from '../lib/correccionCajaGrande';

const categoriasConfig: Record<CategoriaGasto, { label: string; color: string }> = {
  sueldo: { label: 'Sueldo', color: 'bg-purple-100 text-purple-700' },
  fijo: { label: 'Fijo', color: 'bg-blue-100 text-blue-700' },
  variable: { label: 'Variable', color: 'bg-amber-100 text-amber-700' },
  extra: { label: 'Extra', color: 'bg-red-100 text-red-700' },
};

const estadosGasto = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  pagado: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-700' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
};

const metodosConfig: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  debito: 'Débito',
  credito: 'Crédito',
  // Solo para leer cobros: los gastos todavía no se pagan por Mercado Pago.
  mercado_pago: 'Mercado Pago',
  mixto: 'Mixto',
};

const todayKey = () => dayKey();

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Ajustes de la Caja grande que se ven en sus movimientos (ver correccionCajaGrande.ts). */
const esAjusteCajaGrande = (movimiento: Parameters<typeof esAjustePorConteo>[0]) =>
  esCorreccionArqueo(movimiento) || esAjustePorConteo(movimiento);

const ordenCuentas = (cuentas: CuentaDinero[]) => {
  const prioridad = [cuentaCajaDiaId, cuentaCajaGrandeId, cuentaBancoId, 'cuenta-mercado-pago'];
  return [...cuentas].sort((a, b) => {
    const ia = prioridad.indexOf(a.id);
    const ib = prioridad.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.nombre.localeCompare(b.nombre, 'es');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

const colorCuenta = {
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  violet: 'bg-violet-50 text-violet-600 border-violet-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  slate: 'bg-slate-50 text-slate-600 border-slate-100',
} as const;

type ColorCuenta = keyof typeof colorCuenta;

const estiloCuenta = (cuenta: CuentaDinero): { icon: typeof Wallet; color: ColorCuenta; sub: string } => {
  if (cuenta.id === cuentaCajaDiaId) {
    return { icon: Banknote, color: 'amber', sub: 'Plata del día' };
  }
  if (cuenta.id === cuentaCajaGrandeId) {
    return { icon: Wallet, color: 'blue', sub: 'Tesorería' };
  }
  if (cuenta.tipo === 'banco') {
    return { icon: Landmark, color: 'green', sub: 'Banco' };
  }
  if (cuenta.tipo === 'billetera_virtual') {
    return { icon: Smartphone, color: 'violet', sub: 'Billetera' };
  }
  if (cuenta.tipo === 'tarjeta') {
    return { icon: CreditCard, color: 'red', sub: 'Tarjeta' };
  }
  return { icon: Wallet, color: 'slate', sub: 'Cuenta' };
};

interface GastosProps {
  apartadoInicial?: 'pagos' | 'traspasos';
  onNavigate?: (page: PageId) => void;
}

const tiposConcepto = ['Alquiler', 'Luz', 'Gas', 'Agua', 'Proveedor', 'Otros'] as const;
type TipoConcepto = typeof tiposConcepto[number];

export default function Gastos({ apartadoInicial, onNavigate }: GastosProps) {
  const { user } = useAuth();
  const gastos = useGastos();
  const cajas = useCajas();
  const apartado = apartadoInicial || null;
  const trabajandoAhora = useFichadas().filter(f => !f.salida).length;
  const [cuentas, setCuentas] = useState<CuentaDinero[]>(loadCuentasDinero);
  const [movimientos, setMovimientos] = useState(loadMovimientosFinancieros);
  const [proveedores] = useState<Proveedor[]>(loadProveedores);
  const [showForm, setShowForm] = useState(false);
  const [tipoConcepto, setTipoConcepto] = useState<TipoConcepto | ''>('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGasto>('extra');
  const [alcance, setAlcance] = useState<AlcanceGasto>('caja_dia');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayKey());
  const [observaciones, setObservaciones] = useState('');
  const [cuentaOrigenId, setCuentaOrigenId] = useState('cuenta-caja-grande');
  const [proveedorId, setProveedorId] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [estado, setEstado] = useState<'pendiente' | 'pagado' | 'vencido'>('pagado');
  const [vencimiento, setVencimiento] = useState(todayKey());
  const [recurrente, setRecurrente] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'pagado' | 'vencido'>('todos');
  const [filtroCuenta, setFiltroCuenta] = useState('todos');
  const [cuentaEfectivoId, setCuentaEfectivoId] = useState('cuenta-caja-grande');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('cuenta-banco');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoTransferencia, setMontoTransferencia] = useState('');
  const [gastoError, setGastoError] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [showRecuperar, setShowRecuperar] = useState(false);
  const [aRecuperar, setARecuperar] = useState<Set<string>>(new Set());
  // Se pagó con más efectivo del que figuraba en la caja del día: se guarda igual, con este aviso.
  const [avisoGasto, setAvisoGasto] = useState('');
  const [showNuevaCuenta, setShowNuevaCuenta] = useState(false);
  const [nuevaCuentaNombre, setNuevaCuentaNombre] = useState('');
  const [nuevaCuentaTipo, setNuevaCuentaTipo] = useState<TipoCuentaDinero>('efectivo');
  const [nuevaCuentaSaldo, setNuevaCuentaSaldo] = useState('');
  const [nuevaCuentaError, setNuevaCuentaError] = useState('');
  const [cuentaAbiertaId, setCuentaAbiertaId] = useState<string | null>(null);
  const [traspasoDestinoId, setTraspasoDestinoId] = useState(cuentaBancoId);
  const [traspasoMonto, setTraspasoMonto] = useState('');
  const [traspasoError, setTraspasoError] = useState('');
  // En un traspaso que toca la caja del día: si es efectivo del cajón o plata de transferencias/tarjeta.
  const [traspasoEnEfectivo, setTraspasoEnEfectivo] = useState(true);
  const [empleadoId, setEmpleadoId] = useState('');
  const [periodo, setPeriodo] = useState(periodoActual());
  const usuarios = useUsuarios();

  useEffect(() => {
    const actualizar = () => {
      setCuentas(loadCuentasDinero());
      setMovimientos(loadMovimientosFinancieros());
    };
    const eventos = ['restaurant-cuentas-dinero-updated', 'restaurant-movimientos-financieros-updated', 'storage'];
    eventos.forEach(evento => window.addEventListener(evento, actualizar));
    return () => eventos.forEach(evento => window.removeEventListener(evento, actualizar));
  }, []);

  useEffect(() => {
    if (apartado !== 'traspasos') {
      setCuentaAbiertaId(null);
      setShowNuevaCuenta(false);
    }
  }, [apartado]);

  const abrirNuevaCuenta = () => {
    setShowNuevaCuenta(true);
    setNuevaCuentaNombre('');
    setNuevaCuentaTipo('banco');
    setNuevaCuentaSaldo('');
    setNuevaCuentaError('');
  };

  // La caja abierta ahora (también una de ayer que quedó sin cerrar): sus gastos son los de su horario.
  const cajaHoy = cajaAbiertaActual(cajas);
  const esperadoCajaHoy = cajaHoy ? recalcularEsperadoEfectivo(cajaHoy, movimientos) : 0;
  const gastosHoy = gastos.filter(gasto => gasto.fecha === todayKey());
  const totalGastosHoy = gastosHoy.reduce((sum, gasto) => sum + gasto.monto, 0);
  // Con la caja abierta: lo que salió del cajón desde que se abrió. Sin caja abierta: lo del día.
  const totalDescuentoCajaHoy = cajaHoy
    ? efectivoGastadoDeLaCaja(cajaHoy, movimientos)
    : movimientos
      .filter(mov => mov.fecha === todayKey() && mov.tipo === 'salida' && mov.cuenta_id === cuentaCajaDiaId)
      .reduce((sum, mov) => sum + mov.monto, 0);
  const gastosPendientes = gastos.filter(gasto => (gasto.estado || 'pagado') !== 'pagado');
  const totalPendiente = gastosPendientes.reduce((sum, gasto) => sum + Math.max(0, gasto.monto - (gasto.monto_pagado || 0)), 0);
  const disponibleCajaHoy = esperadoCajaHoy + (cajaHoy?.tarjeta ?? 0) + (cajaHoy?.transferencia ?? 0);
  const gastosFiltrados = gastos
    .filter(gasto => filtroEstado === 'todos' || (gasto.estado || 'pagado') === filtroEstado)
    .filter(gasto => filtroCuenta === 'todos' || gasto.cuenta_origen_id === filtroCuenta || gasto.pagos_divididos?.some(parte => parte.cuenta_id === filtroCuenta))
    // Los más nuevos arriba, sin importar en qué orden llegaron de la sincronización.
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at || '').localeCompare(a.created_at || ''));

  const recuperables = useMemo(() => gastosRecuperables(gastos, movimientos, usuarios), [gastos, movimientos, usuarios]);

  const abrirRecuperar = () => {
    setARecuperar(new Set(recuperables.map(item => item.gasto.id)));
    setShowRecuperar(true);
  };

  const recuperarGastos = () => {
    withStoreTransaction(() => {
      // Se vuelve a calcular con lo guardado ahora, por si llegó algo de otro equipo.
      const actuales = loadGastos();
      const nuevos = gastosRecuperables(actuales, loadMovimientosFinancieros(), usuarios)
        .map(item => item.gasto)
        .filter(gasto => aRecuperar.has(gasto.id) && !actuales.some(item => item.id === gasto.id));
      // Solo se agrega el gasto: la plata ya se había descontado cuando se pagó.
      if (nuevos.length) saveGastos([...nuevos, ...actuales]);
    });
    setShowRecuperar(false);
  };

  const resetForm = () => {
    setTipoConcepto('');
    setConcepto('');
    setCategoria('extra');
    setAlcance('caja_dia');
    setMetodoPago('efectivo');
    setMonto('');
    setFecha(todayKey());
    setObservaciones('');
    setCuentaOrigenId('cuenta-caja-grande');
    setProveedorId('');
    setComprobante('');
    setEstado('pagado');
    setVencimiento(todayKey());
    setRecurrente(false);
    setCuentaEfectivoId('cuenta-caja-grande');
    setCuentaTransferenciaId('cuenta-banco');
    setMontoEfectivo('');
    setMontoTransferencia('');
    setGastoError('');
    setEmpleadoId('');
    setPeriodo(periodoActual());
    setEditandoId(null);
  };

  const cerrarForm = () => {
    resetForm();
    setShowForm(false);
  };

  const abrirEdicion = (gasto: Gasto) => {
    if (gasto.compra_id) return;
    resetForm();
    const tipo = (tiposConcepto as readonly string[]).includes(gasto.concepto)
      ? gasto.concepto as TipoConcepto
      : gasto.proveedor_id && gasto.concepto.startsWith('Proveedor - ') ? 'Proveedor' : 'Otros';
    setTipoConcepto(tipo);
    setConcepto(tipo === 'Otros' ? gasto.concepto : '');
    setCategoria(gasto.categoria);
    setAlcance(gasto.alcance);
    setMetodoPago(gasto.metodo_pago);
    setMonto(String(gasto.monto));
    setFecha(gasto.fecha);
    setObservaciones(gasto.observaciones || '');
    if (gasto.cuenta_origen_id && gasto.cuenta_origen_id !== cuentaCajaDiaId) setCuentaOrigenId(gasto.cuenta_origen_id);
    setProveedorId(gasto.proveedor_id || '');
    setComprobante(gasto.comprobante || '');
    setEstado(gasto.estado || 'pagado');
    setVencimiento(gasto.vencimiento || gasto.fecha);
    setRecurrente(Boolean(gasto.recurrente));
    const parteEfectivo = gasto.pagos_divididos?.find(parte => parte.metodo_pago === 'efectivo');
    const parteTransferencia = gasto.pagos_divididos?.find(parte => parte.metodo_pago === 'transferencia');
    if (parteEfectivo) {
      setMontoEfectivo(String(parteEfectivo.monto));
      if (parteEfectivo.cuenta_id !== cuentaCajaDiaId) setCuentaEfectivoId(parteEfectivo.cuenta_id);
    }
    if (parteTransferencia) {
      setMontoTransferencia(String(parteTransferencia.monto));
      setCuentaTransferenciaId(parteTransferencia.cuenta_id);
    }
    setEmpleadoId(gasto.empleado_id || '');
    if (gasto.periodo) setPeriodo(gasto.periodo);
    setEditandoId(gasto.id);
    setShowForm(true);
  };

  const saveGasto = () => {
    const parsedMonto = parseFloat(monto);
    const proveedorElegido = proveedores.find(proveedor => proveedor.id === proveedorId);
    const conceptoFinal = tipoConcepto === 'Otros'
      ? concepto.trim()
      : tipoConcepto === 'Proveedor' && proveedorElegido
        ? `Proveedor - ${proveedorElegido.nombre}`
        : tipoConcepto;
    if (!tipoConcepto) {
      setGastoError('Elegí el concepto del gasto.');
      return;
    }
    if (!conceptoFinal) {
      setGastoError('Escribí el concepto del gasto.');
      return;
    }
    if (!parsedMonto || parsedMonto <= 0) {
      setGastoError('Ingresá un monto mayor que cero.');
      return;
    }
    const efectivoMixto = parseFloat(montoEfectivo) || 0;
    const transferenciaMixta = parseFloat(montoTransferencia) || 0;
    if (metodoPago === 'mixto' && Math.abs(efectivoMixto + transferenciaMixta - parsedMonto) > 0.009) {
      setGastoError(`La suma de efectivo y transferencia debe ser ${formatMoney(parsedMonto)}.`);
      return;
    }
    if (metodoPago === 'mixto' && (efectivoMixto <= 0 || transferenciaMixta <= 0)) {
      setGastoError('Ingresá un importe mayor que cero para efectivo y transferencia.');
      return;
    }
    const empleado = categoria === 'sueldo' ? usuarios.find(u => u.id === empleadoId) : undefined;
    const original = editandoId ? gastos.find(item => item.id === editandoId) : undefined;
    if (editandoId && !original) {
      setGastoError('Este gasto ya no existe. Cerrá el formulario y volvé a intentar.');
      return;
    }

    const gasto: Gasto = {
      ...(original ?? {}),
      id: original?.id ?? nuevoId('gasto'),
      fecha,
      concepto: conceptoFinal,
      categoria,
      alcance,
      metodo_pago: metodoPago,
      monto: parsedMonto,
      observaciones: observaciones.trim(),
      created_at: original?.created_at ?? new Date().toISOString(),
      creado_por: original ? original.creado_por : user ? `${user.nombre} ${user.apellido}` : undefined,
      cuenta_origen_id: alcance === 'caja_dia' && metodoPago === 'efectivo' ? cuentaCajaDiaId : cuentaOrigenId,
      pagos_divididos: metodoPago === 'mixto' ? [
        { metodo_pago: 'efectivo', cuenta_id: alcance === 'caja_dia' ? cuentaCajaDiaId : cuentaEfectivoId, monto: efectivoMixto },
        { metodo_pago: 'transferencia', cuenta_id: cuentaTransferenciaId, monto: transferenciaMixta },
      ] : undefined,
      proveedor_id: proveedorId || undefined,
      comprobante: comprobante.trim(),
      estado,
      vencimiento,
      recurrente,
      // Un sueldo con persona elegida suma a su estado de cuenta.
      empleado_id: empleado?.id,
      periodo: empleado ? periodo : undefined,
      sueldo_mes: empleado?.sueldo,
    };

    const enCajon = cajaHoy ? recalcularEsperadoEfectivo(cajaHoy, loadMovimientosFinancieros()) : 0;
    const efectivoQueSale = (gasto.estado || 'pagado') === 'pagado' ? efectivoDelCajon(gasto) : 0;
    // Sin caja abierta el efectivo del cajón ya pasó a la caja grande: un gasto así no caería en ningún arqueo.
    if (!original && efectivoQueSale > 0 && !cajaHoy) {
      setGastoError('La caja del día está cerrada. Abrí la caja para pagar en efectivo desde el cajón, o elegí que salga de la caja grande.');
      return;
    }
    // El cajón no puede pagar más de lo que tiene: lo que falta sale de la caja fuerte y se carga desde la Caja grande.
    const disponibleEnCajon = Math.max(enCajon, efectivoEnCajaAbierta(gasto.fecha)) + (original ? efectivoDelCajon(original) : 0);
    if (efectivoQueSale - disponibleEnCajon > 0.009) {
      setGastoError(mensajeGastoSinEfectivo(disponibleEnCajon, efectivoQueSale));
      return;
    }
    try {
      if (original) {
        withStoreTransaction(() => {
          const posicion = loadGastos().findIndex(item => item.id === original.id);
          revertirGasto(original, 'Edicion de gasto');
          saveGastos(loadGastos().filter(item => item.id !== original.id));
          registrarGasto(gasto);
          // registrarGasto lo agrega arriba; lo dejamos en el lugar que tenía.
          if (posicion > 0) {
            const resto = loadGastos().filter(item => item.id !== gasto.id);
            resto.splice(posicion, 0, gasto);
            saveGastos(resto);
          }
        });
      } else {
        registrarGasto(gasto);
      }
    } catch (error) {
      setGastoError(error instanceof Error ? error.message : 'No se pudo guardar el gasto.');
      return;
    }
    setAvisoGasto('');
    setCuentas(loadCuentasDinero());
    resetForm();
    setShowForm(false);
  };

  const guardarNuevaCuenta = () => {
    const nombre = nuevaCuentaNombre.trim();
    const saldo = parseFloat(nuevaCuentaSaldo) || 0;
    if (!nombre) {
      setNuevaCuentaError('Ingresá el nombre de la cuenta.');
      return;
    }
    if (cuentas.some(cuenta => cuenta.nombre.toLowerCase() === nombre.toLowerCase())) {
      setNuevaCuentaError('Ya existe una cuenta con ese nombre.');
      return;
    }
    const nuevaCuenta: CuentaDinero = {
      id: nuevoId('cuenta'),
      nombre,
      tipo: nuevaCuentaTipo,
      saldo,
      activa: true,
      created_at: new Date().toISOString(),
    };
    const actualizadas = [...cuentas, nuevaCuenta];
    saveCuentasDinero(actualizadas);
    setCuentas(actualizadas);
    setCuentaOrigenId(nuevaCuenta.id);
    setTraspasoDestinoId(nuevaCuenta.id);
    setShowNuevaCuenta(false);
    setNuevaCuentaNombre('');
    setNuevaCuentaTipo('efectivo');
    setNuevaCuentaSaldo('');
    setNuevaCuentaError('');
  };

  /** Devuelve la plata a las cuentas y a la caja del día, como si el gasto no se hubiera pagado. */
  const revertirGasto = (gasto: Gasto, motivo: string) => {
    if ((gasto.estado || 'pagado') === 'pagado' && gasto.pagos_divididos?.length) {
      gasto.pagos_divididos.forEach(parte => registrarEntradaCuenta({
        cuenta_id: parte.cuenta_id, monto: parte.monto,
        descripcion: `${motivo}: ${gasto.concepto} (${metodosConfig[parte.metodo_pago]})`,
        origen: 'ajuste', fecha: todayKey(),
      }));
      setCuentas(loadCuentasDinero());
    } else if ((gasto.estado || 'pagado') === 'pagado' && gasto.cuenta_origen_id) {
      registrarEntradaCuenta({
        cuenta_id: gasto.alcance === 'caja_dia' && gasto.metodo_pago === 'efectivo' ? cuentaCajaDiaId : gasto.cuenta_origen_id,
        monto: gasto.monto,
        descripcion: `${motivo}: ${gasto.concepto}`,
        origen: 'ajuste',
        fecha: todayKey(),
      });
      setCuentas(loadCuentasDinero());
    }
    if ((gasto.estado || 'pagado') === 'pagado') {
      const efectivo = efectivoDelCajon(gasto);
      if (efectivo > 0) aplicarGastoEnCajaDia(gasto.fecha, efectivo, -1);
    }
  };

  const deleteGasto = (gastoId: string) => {
    const gasto = gastos.find(item => item.id === gastoId);
    if (!gasto || gasto.compra_id) return;
    if (!window.confirm(`¿Borrar el gasto "${gasto.concepto}" de ${formatMoney(gasto.monto)}? Si estaba pagado, la plata vuelve a su cuenta.`)) return;
    withStoreTransaction(() => {
      revertirGasto(gasto, 'Anulacion de gasto');
      saveGastos(loadGastos().filter(item => item.id !== gastoId));
    });
    setCuentas(loadCuentasDinero());
    if (editandoId === gastoId) cerrarForm();
  };

  const totalByCategoria = (target: CategoriaGasto) =>
    gastosHoy.filter(gasto => gasto.categoria === target).reduce((sum, gasto) => sum + gasto.monto, 0);

  const cuentasActivas = ordenCuentas(cuentas.filter(cuenta => cuenta.activa));
  const nombreCuenta = (id?: string) => cuentas.find(cuenta => cuenta.id === id)?.nombre || 'Cuenta';
  const cuentaAbierta = cuentasActivas.find(cuenta => cuenta.id === cuentaAbiertaId) || null;
  const destinosTraspaso = cuentasActivas.filter(cuenta => cuenta.id !== cuentaAbierta?.id);

  const abrirCuenta = (id: string) => {
    setCuentaAbiertaId(id);
    const otra = cuentasActivas.find(cuenta => cuenta.id !== id);
    setTraspasoDestinoId(otra?.id || id);
    setTraspasoMonto('');
    setTraspasoError('');
  };

  const tocaCajaDia = cuentaAbierta?.id === cuentaCajaDiaId || traspasoDestinoId === cuentaCajaDiaId;

  const guardarTraspaso = () => {
    const origenId = cuentaAbierta?.id;
    const montoNum = Number.parseFloat(traspasoMonto.replace(',', '.'));
    setTraspasoError('');
    if (!origenId) {
      setTraspasoError('Elegí de qué cuenta sale la plata.');
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setTraspasoError('Ingresá un monto mayor a cero.');
      return;
    }
    if (origenId === traspasoDestinoId) {
      setTraspasoError('Elegí a qué cuenta va la plata.');
      return;
    }
    const origen = cuentas.find(cuenta => cuenta.id === origenId);
    const destino = cuentas.find(cuenta => cuenta.id === traspasoDestinoId);
    if (!origen || !destino) {
      setTraspasoError('No se encontró una de las cuentas.');
      return;
    }
    if (origen.saldo < montoNum) {
      setTraspasoError(`No hay suficiente saldo en ${origen.nombre}. Disponible: ${formatMoney(origen.saldo)}.`);
      return;
    }

    const fecha = todayKey();
    try {
      withStoreTransaction(() => {
        transferirEntreCuentas({
          cuenta_origen_id: origenId,
          cuenta_destino_id: traspasoDestinoId,
          monto: montoNum,
          descripcion: `Traspaso de ${origen.nombre} a ${destino.nombre}${tocaCajaDia && !traspasoEnEfectivo ? ' (transferencias/tarjeta)' : ''}`,
          fecha,
        });
        // Solo el efectivo cambia lo que hay que contar en el cajón.
        if (traspasoEnEfectivo && origenId === cuentaCajaDiaId) aplicarGastoEnCajaDia(fecha, montoNum, 1);
        if (traspasoEnEfectivo && traspasoDestinoId === cuentaCajaDiaId) aplicarGastoEnCajaDia(fecha, montoNum, -1);
      });
    } catch (error) {
      setTraspasoError(error instanceof Error ? error.message : 'No se pudo hacer el traspaso.');
      return;
    }
    setCuentas(loadCuentasDinero());
    setMovimientos(loadMovimientosFinancieros());
    setTraspasoMonto('');
  };

  if (!apartado) {
    return (
      <div className="space-y-5">
        <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 to-amber-950 px-6 py-5">
            <h2 className="text-white font-bold text-xl">Gastos</h2>
            <p className="text-slate-300 text-sm mt-1">Elegí si vas a pagar algo, mover plata entre cuentas o marcar los horarios del personal.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => onNavigate?.('gastos_pagos')}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-amber-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
              <Wallet size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Pagos</h3>
            <p className="text-sm text-slate-500 mt-1">
              Sueldos, alquiler, extras y todo lo que sale del local.
            </p>
            <p className="text-xs font-semibold text-amber-600 mt-4">{gastosHoy.length} pagos cargados hoy</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('gastos_traspasos')}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-emerald-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <ArrowLeftRight size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Traspasos</h3>
            <p className="text-sm text-slate-500 mt-1">
              Pasá plata de efectivo a banco, transferencia o al revés. No es un gasto: la plata sigue siendo tuya.
            </p>
            <p className="text-xs font-semibold text-emerald-600 mt-4">{cuentasActivas.length} cuentas disponibles</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('gastos_reloj')}
            className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-sky-300 hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mb-4">
              <Clock size={22} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Reloj del personal</h3>
            <p className="text-sm text-slate-500 mt-1">
              Entrada y salida de cada empleado. Se le paga por las horas trabajadas, desde la caja del día, la caja grande o por transferencia.
            </p>
            <p className="text-xs font-semibold text-sky-600 mt-4">{trabajandoAhora} trabajando ahora</p>
          </button>
        </div>
      </div>
    );
  }

  if (apartado === 'traspasos') {
    const totalCuentas = cuentasActivas.reduce((sum, cuenta) => sum + cuenta.saldo, 0);
    const destinoSeleccionado = destinosTraspaso.find(cuenta => cuenta.id === traspasoDestinoId);
    const movimientosCuenta = cuentaAbierta
      ? movimientos.filter(movimiento =>
          (movimiento.origen === 'transferencia_interna'
            && (movimiento.cuenta_id === cuentaAbierta.id || movimiento.cuenta_destino_id === cuentaAbierta.id))
          || (esAjusteCajaGrande(movimiento) && movimiento.cuenta_id === cuentaAbierta.id)
        )
      : [];

    const modalNuevaCuenta = showNuevaCuenta ? (
      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800">Nueva cuenta</h3>
              <p className="text-sm text-slate-500">Va a aparecer en Traspasos para mover plata.</p>
            </div>
            <button type="button" onClick={() => setShowNuevaCuenta(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
              <input
                value={nuevaCuentaNombre}
                onChange={e => { setNuevaCuentaNombre(e.target.value); setNuevaCuentaError(''); }}
                placeholder="Ej: Banco Galicia, Mercado Pago 2"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                <select
                  value={nuevaCuentaTipo}
                  onChange={e => setNuevaCuentaTipo(e.target.value as TipoCuentaDinero)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-amber-400"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="banco">Banco</option>
                  <option value="billetera_virtual">Billetera virtual</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otra">Otra</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Saldo inicial</label>
                <input
                  type="number"
                  value={nuevaCuentaSaldo}
                  onChange={e => setNuevaCuentaSaldo(e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right outline-none focus:border-amber-400"
                />
              </div>
            </div>
            {nuevaCuentaError && <p className="text-sm font-medium text-red-600">{nuevaCuentaError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNuevaCuenta(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarNuevaCuenta}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Guardar cuenta
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

    if (cuentaAbierta) {
      const visual = estiloCuenta(cuentaAbierta);
      const Icono = visual.icon;

      return (
        <div className="space-y-5">
          <button
            type="button"
                onClick={() => {
                  setCuentaAbiertaId(null);
                  setTraspasoError('');
                  setTraspasoMonto('');
                }}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Todas las cuentas
          </button>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorCuenta[visual.color]}`}>
                <Icono size={18} />
              </div>
              <p className="text-xs font-medium text-slate-500">{visual.sub}</p>
            </div>
            <p className={`text-3xl font-bold ${cuentaAbierta.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {formatMoney(cuentaAbierta.saldo)}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">{cuentaAbierta.nombre}</p>
          </div>

          {cuentaAbierta.id === cuentaCajaGrandeId && (user?.rol === 'admin' || user?.rol === 'encargado') && (
            <RevisionArqueosCajaGrande
              saldo={cuentaAbierta.saldo}
              movimientos={movimientos}
              creadoPor={user?.id}
              onCambio={() => {
                setCuentas(loadCuentasDinero());
                setMovimientos(loadMovimientosFinancieros());
              }}
            />
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-800">Pasar plata a</h3>
              <p className="text-sm text-slate-500">Tocá a dónde va y confirmá el monto. No es un gasto.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {destinosTraspaso.map(cuenta => {
                const destinoVisual = estiloCuenta(cuenta);
                const DestinoIcono = destinoVisual.icon;
                const activo = cuenta.id === traspasoDestinoId;
                return (
                  <button
                    key={cuenta.id}
                    type="button"
                    onClick={() => setTraspasoDestinoId(cuenta.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      activo ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${colorCuenta[destinoVisual.color]}`}>
                      <DestinoIcono size={16} />
                    </div>
                    <p className="text-base font-bold text-slate-800">{formatMoney(cuenta.saldo)}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{cuenta.nombre}</p>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={abrirNuevaCuenta}
                className="rounded-2xl border border-dashed border-slate-300 p-4 text-left hover:border-amber-400 hover:bg-amber-50/50 transition-all"
              >
                <div className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center mb-3">
                  <Plus size={16} />
                </div>
                <p className="text-sm font-semibold text-slate-800">Nueva cuenta</p>
                <p className="text-xs text-slate-500 mt-0.5">Agregar destino</p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Monto a pasar</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={traspasoMonto}
                onChange={e => setTraspasoMonto(e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
            </div>

            {tocaCajaDia && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">¿Qué plata de la caja del día?</label>
                <div className="grid grid-cols-2 gap-2">
                  {([[true, 'Efectivo del cajón'], [false, 'Transferencias o tarjeta']] as const).map(([valor, texto]) => (
                    <button
                      key={texto}
                      type="button"
                      onClick={() => setTraspasoEnEfectivo(valor)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium ${traspasoEnEfectivo === valor ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Solo el efectivo cambia lo que hay que contar al cerrar la caja.</p>
              </div>
            )}

            {traspasoError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{traspasoError}</p>
            )}

            <button
              type="button"
              onClick={guardarTraspaso}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              <ArrowLeftRight size={14} />
              {destinoSeleccionado
                ? `Pasar a ${destinoSeleccionado.nombre}`
                : 'Pasar plata'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Movimientos</h3>
              <p className="text-sm text-slate-500">Solo a dónde fue la plata.</p>
            </div>
            {movimientosCuenta.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">Todavía no hay traspasos en esta cuenta.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {movimientosCuenta.map(movimiento => {
                  const correccion = esAjusteCajaGrande(movimiento);
                  const sale = correccion ? movimiento.tipo === 'salida' : movimiento.cuenta_id === cuentaAbierta.id;
                  const destino = nombreCuenta(sale ? movimiento.cuenta_destino_id : movimiento.cuenta_id);
                  return (
                    <div key={movimiento.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        {correccion ? movimiento.descripcion.replace(/:.*$/, '') : sale ? `A ${destino}` : `De ${destino}`}
                      </p>
                      <p className={`text-sm font-bold ${sale ? 'text-slate-800' : 'text-emerald-600'}`}>
                        {sale ? '−' : '+'}{formatMoney(movimiento.monto)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {modalNuevaCuenta}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => onNavigate?.('gastos')}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Gastos
        </button>

        <div>
          <h2 className="font-semibold text-slate-800">Traspasos</h2>
          <p className="text-sm text-slate-500">
            Tocá una cuenta para ver la plata, los movimientos y pasar a otra.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cuentasActivas.map(cuenta => {
            const visual = estiloCuenta(cuenta);
            const Icono = visual.icon;
            return (
              <button
                key={cuenta.id}
                type="button"
                onClick={() => abrirCuenta(cuenta.id)}
                className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorCuenta[visual.color]}`}>
                    <Icono size={18} />
                  </div>
                  <p className="text-xs font-medium text-slate-500">{visual.sub}</p>
                </div>
                <p className={`text-2xl font-bold ${cuenta.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatMoney(cuenta.saldo)}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{cuenta.nombre}</p>
              </button>
            );
          })}
          <button
            type="button"
            onClick={abrirNuevaCuenta}
            className="bg-white rounded-2xl border border-dashed border-slate-300 p-5 text-left hover:border-amber-400 hover:bg-amber-50/40 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center">
                <Plus size={18} />
              </div>
              <p className="text-xs font-medium text-slate-500">Nueva</p>
            </div>
            <p className="text-lg font-bold text-slate-800">Agregar cuenta</p>
            <p className="text-sm text-slate-500 mt-0.5">Banco, billetera u otra</p>
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Total en cuentas: <span className="font-semibold text-slate-800">{formatMoney(totalCuentas)}</span>
        </p>
        {modalNuevaCuenta}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {avisoGasto && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{avisoGasto}</p>
          <button type="button" onClick={() => setAvisoGasto('')} className="text-amber-700 hover:text-amber-900" aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Caja disponible hoy</p>
          <p className={`text-xl font-bold ${disponibleCajaHoy < 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {formatMoney(disponibleCajaHoy)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-red-600 mb-1">Gastos hoy</p>
          <p className="text-xl font-bold text-red-700">{formatMoney(totalGastosHoy)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-600 mb-1">Descuento caja hoy</p>
          <p className="text-xl font-bold text-blue-700">{formatMoney(totalDescuentoCajaHoy)}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Pendientes</p>
          <p className="text-xl font-bold text-slate-800">{formatMoney(totalPendiente)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {(Object.keys(categoriasConfig) as CategoriaGasto[]).map(key => (
          <div key={key} className="bg-white border border-slate-200 rounded-xl p-4">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoriasConfig[key].color}`}>
              {categoriasConfig[key].label}
            </span>
            <p className="text-lg font-bold text-slate-800 mt-3">{formatMoney(totalByCategoria(key))}</p>
            <p className="text-xs text-slate-500">Hoy</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate?.('gastos')}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-2"
          >
            <ArrowLeft size={16} />
            Gastos
          </button>
          <h2 className="font-semibold text-slate-800">Pagos</h2>
          <p className="text-sm text-slate-500">Registrá pagos de sueldos, fijos, variables y extras</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        {recuperables.length > 0 && (
          <button
            onClick={abrirRecuperar}
            className="flex items-center gap-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <History size={14} />
            Recuperar gastos ({recuperables.length})
          </button>
        )}
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Plus size={14} />
          Nuevo gasto
        </button>
        </div>
      </div>

      <SueldosDelMes />

      <div className="grid grid-cols-2 gap-3 bg-white rounded-2xl border border-slate-200 p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Estado</label>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as typeof filtroEstado)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
          >
            <option value="todos">Todos</option>
            <option value="pagado">Pagados</option>
            <option value="pendiente">Pendientes</option>
            <option value="vencido">Vencidos</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cuenta</label>
          <select
            value={filtroCuenta}
            onChange={e => setFiltroCuenta(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
          >
            <option value="todos">Todas</option>
            {cuentas.filter(cuenta => cuenta.activa).map(cuenta => (
              <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Concepto</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Cuenta</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Método</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Monto</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gastosFiltrados.map(gasto => {
                const cuenta = cuentas.find(item => item.id === gasto.cuenta_origen_id);
                const cuentasMixtas = gasto.pagos_divididos?.map(parte => ({
                  ...parte,
                  nombre: cuentas.find(item => item.id === parte.cuenta_id)?.nombre || 'Cuenta',
                }));
                const proveedor = proveedores.find(item => item.id === gasto.proveedor_id);
                const estadoGasto = gasto.estado || 'pagado';

                return (
                  <tr key={gasto.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {new Date(`${gasto.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-800">{gasto.concepto}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        {proveedor && <span>{proveedor.nombre}</span>}
                        {gasto.comprobante && <span>Comp. {gasto.comprobante}</span>}
                        {gasto.recurrente && <span>Recurrente</span>}
                      </div>
                      {gasto.observaciones && <p className="text-xs text-slate-400">{gasto.observaciones}</p>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoriasConfig[gasto.categoria].color}`}>
                        {categoriasConfig[gasto.categoria].label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {cuentasMixtas?.length ? cuentasMixtas.map(parte => <p key={`${gasto.id}-${parte.cuenta_id}`} className="text-xs font-medium text-slate-700">{parte.nombre}: {formatMoney(parte.monto)}</p>) : <p className="text-xs font-medium text-slate-700">{cuenta?.nombre || 'Sin cuenta'}</p>}
                      <p className="text-[11px] text-slate-400">
                        {gasto.alcance === 'caja_dia' ? 'Caja del dia' : 'General'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-500">{metodosConfig[gasto.metodo_pago]}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadosGasto[estadoGasto].color}`}>
                        {estadosGasto[estadoGasto].label}
                      </span>
                      {estadoGasto !== 'pagado' && gasto.vencimiento && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Vence {new Date(`${gasto.vencimiento}T00:00:00`).toLocaleDateString('es-AR')}
                        </p>
                      )}
                      {gasto.compra_id && (gasto.monto_pagado || 0) > 0 && estadoGasto !== 'pagado' && (
                        <p className="text-[11px] text-slate-500 mt-1">Pagado: {formatMoney(gasto.monto_pagado || 0)} · Resta: {formatMoney(gasto.monto - (gasto.monto_pagado || 0))}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-red-600">-{formatMoney(gasto.monto)}</td>
                    <td className="py-3 px-4 text-center">
                      {gasto.compra_id ? <span className="text-xs text-slate-400">Compra de stock</span> : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => abrirEdicion(gasto)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                            title="Editar gasto"
                            aria-label={`Editar gasto ${gasto.concepto}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => deleteGasto(gasto.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar gasto"
                            aria-label={`Eliminar gasto ${gasto.concepto}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {gastosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                    Todavía no hay gastos para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">{editandoId ? 'Editar gasto' : 'Nuevo gasto'}</h3>
                <p className="text-sm text-slate-500">{editandoId ? 'Se devuelve lo descontado antes y se vuelve a descontar con los datos nuevos' : 'El gasto se descontará según el alcance elegido'}</p>
              </div>
              <button onClick={cerrarForm} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto *</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <ReceiptText size={15} className="text-slate-400" />
                  <select
                    value={tipoConcepto}
                    onChange={e => { setTipoConcepto(e.target.value as TipoConcepto | ''); setGastoError(''); }}
                    className="flex-1 text-sm outline-none bg-white"
                  >
                    <option value="">Elegí el concepto</option>
                    {tiposConcepto.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                  </select>
                </div>
                {tipoConcepto === 'Otros' && (
                  <input
                    value={concepto}
                    onChange={e => { setConcepto(e.target.value); setGastoError(''); }}
                    className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Escribí el concepto (ej: arreglo, sueldo, compra extra)"
                    autoFocus
                  />
                )}
                {tipoConcepto === 'Proveedor' && (
                  <p className="mt-1.5 text-xs text-slate-500">Elegí el proveedor más abajo y queda en el concepto.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto *</label>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                    <Wallet size={15} className="text-slate-400" />
                    <input
                      type="number"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      className="flex-1 text-sm outline-none"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha</label>
                  <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                    <CalendarDays size={15} className="text-slate-400" />
                    <input
                      type="date"
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      className="flex-1 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                  <select
                    value={estado}
                    onChange={e => setEstado(e.target.value as typeof estado)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="pagado">Pagado</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="vencido">Vencido</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {metodoPago === 'mixto' ? 'Distribución del pago' : estado === 'pagado' ? 'Cuenta de salida' : 'Pagar desde'}
                  </label>
                  {metodoPago === 'mixto' ? (
                    <div className="w-full border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5 text-sm text-amber-700">Completá las dos partes debajo.</div>
                  ) : <select
                    value={cuentaOrigenId}
                    onChange={e => {
                      if (e.target.value === '__nueva__') {
                        setShowNuevaCuenta(true);
                        setNuevaCuentaError('');
                      } else {
                        setCuentaOrigenId(e.target.value);
                        setShowNuevaCuenta(false);
                      }
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {cuentas.filter(cuenta => cuenta.activa).map(cuenta => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.nombre} - {formatMoney(cuenta.saldo)}
                      </option>
                    ))}
                    <option value="__nueva__">+ Crear nueva cuenta</option>
                  </select>}
                </div>
              </div>

              {metodoPago === 'mixto' && (
                <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div><p className="text-sm font-semibold text-slate-800">Pago mixto</p><p className="text-xs text-slate-500">Indicá de qué cuenta sale cada parte. La suma debe coincidir con el monto total.</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_160px] gap-3 items-end">
                    <div className="pb-2 text-sm font-semibold text-slate-700">Efectivo</div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Cuenta</label><select value={cuentaEfectivoId} onChange={e => setCuentaEfectivoId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">{cuentas.filter(cuenta => cuenta.activa && cuenta.tipo === 'efectivo').map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre} - {formatMoney(cuenta.saldo)}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Importe</label><input type="number" min="0" value={montoEfectivo} onChange={e => { setMontoEfectivo(e.target.value); setGastoError(''); }} placeholder="$ 0" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_160px] gap-3 items-end">
                    <div className="pb-2 text-sm font-semibold text-slate-700">Transferencia</div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Cuenta</label><select value={cuentaTransferenciaId} onChange={e => setCuentaTransferenciaId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">{cuentas.filter(cuenta => cuenta.activa && ['banco', 'billetera_virtual'].includes(cuenta.tipo)).map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre} - {formatMoney(cuenta.saldo)}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Importe</label><input type="number" min="0" value={montoTransferencia} onChange={e => { setMontoTransferencia(e.target.value); setGastoError(''); }} placeholder="$ 0" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400" /></div>
                  </div>
                  <div className="flex justify-end gap-5 text-sm"><span className="text-slate-500">Total del gasto: <strong>{formatMoney(parseFloat(monto) || 0)}</strong></span><span className={(parseFloat(montoEfectivo) || 0) + (parseFloat(montoTransferencia) || 0) === (parseFloat(monto) || 0) ? 'text-emerald-600' : 'text-red-600'}>Distribuido: <strong>{formatMoney((parseFloat(montoEfectivo) || 0) + (parseFloat(montoTransferencia) || 0))}</strong></span></div>
                </div>
              )}

              {showNuevaCuenta && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm font-semibold text-slate-800">Nueva cuenta de dinero</p><p className="text-xs text-slate-500">Se guardará y quedará seleccionada en este gasto.</p></div>
                    <button onClick={() => setShowNuevaCuenta(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label><input value={nuevaCuentaNombre} onChange={e => { setNuevaCuentaNombre(e.target.value); setNuevaCuentaError(''); }} placeholder="Ej: Banco Galicia" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" /></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label><select value={nuevaCuentaTipo} onChange={e => setNuevaCuentaTipo(e.target.value as TipoCuentaDinero)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"><option value="efectivo">Efectivo</option><option value="banco">Banco</option><option value="billetera_virtual">Billetera virtual</option><option value="tarjeta">Tarjeta</option><option value="otra">Otra</option></select></div>
                    <div><label className="block text-xs font-semibold text-slate-600 mb-1">Saldo inicial</label><input type="number" value={nuevaCuentaSaldo} onChange={e => setNuevaCuentaSaldo(e.target.value)} placeholder="0" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400" /></div>
                  </div>
                  {nuevaCuentaError && <p className="text-xs font-medium text-red-600">{nuevaCuentaError}</p>}
                  <div className="flex justify-end"><button type="button" onClick={guardarNuevaCuenta} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl px-4 py-2 text-sm font-semibold"><Check size={15} /> Guardar cuenta</button></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value as CategoriaGasto)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {(Object.keys(categoriasConfig) as CategoriaGasto[]).map(key => (
                      <option key={key} value={key}>{categoriasConfig[key].label}</option>
                    ))}
                  </select>
                  {categoria === 'sueldo' && (
                    <div className="mt-2 space-y-2">
                      <select
                        value={empleadoId}
                        onChange={e => {
                          setEmpleadoId(e.target.value);
                          const elegido = usuarios.find(u => u.id === e.target.value);
                          if (elegido && (!tipoConcepto || (tipoConcepto === 'Otros' && !concepto.trim()))) {
                            setTipoConcepto('Otros');
                            setConcepto(`Sueldo ${nombreUsuario(elegido)}`);
                          }
                        }}
                        aria-label="A quién se le paga"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
                      >
                        <option value="">¿A quién? (opcional)</option>
                        {usuarios.filter(u => u.activo).map(u => <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>)}
                      </select>
                      {empleadoId && (
                        <input type="month" value={periodo} onChange={e => e.target.value && setPeriodo(e.target.value)} aria-label="Mes que se paga"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Método</label>
                  <select
                    value={metodoPago}
                    onChange={e => { setMetodoPago(e.target.value as MetodoPago); setGastoError(''); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {(Object.keys(metodosConfig) as MetodoPago[]).filter(key => key !== 'mercado_pago').map(key => (
                      <option key={key} value={key}>{metodosConfig[key]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Proveedor</label>
                  <select
                    value={proveedorId}
                    onChange={e => setProveedorId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.filter(proveedor => proveedor.activo).map(proveedor => (
                      <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Comprobante</label>
                  <input
                    value={comprobante}
                    onChange={e => setComprobante(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Factura, ticket o referencia"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Vencimiento</label>
                  <input
                    type="date"
                    value={vencimiento}
                    onChange={e => setVencimiento(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
                <label className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-600 mt-6">
                  <input
                    type="checkbox"
                    checked={recurrente}
                    onChange={e => setRecurrente(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  Gasto recurrente
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descontar de</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAlcance('caja_dia')}
                    className={`p-3 rounded-xl border-2 text-left text-sm transition-all ${
                      alcance === 'caja_dia'
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    Caja del día
                  </button>
                  <button
                    onClick={() => setAlcance('general')}
                    className={`p-3 rounded-xl border-2 text-left text-sm transition-all ${
                      alcance === 'general'
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    Total general
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                  rows={3}
                  placeholder="Detalle opcional"
                />
              </div>
              {gastoError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{gastoError}</div>}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={cerrarForm}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveGasto}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                {editandoId ? 'Guardar cambios' : 'Guardar gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecuperar && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Recuperar gastos</h3>
                <p className="text-sm text-slate-500">
                  Esta plata salió de las cuentas pero el gasto no quedó en la lista (pasaba cuando se pagaba desde la caja con un usuario de caja).
                  Se agregan a la lista <strong>sin volver a descontar la plata</strong>. Destildá los que no quieras recuperar.
                </p>
              </div>
              <button onClick={() => setShowRecuperar(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {recuperables.map(({ gasto }) => (
                <label key={gasto.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aRecuperar.has(gasto.id)}
                    onChange={e => setARecuperar(prev => {
                      const siguiente = new Set(prev);
                      if (e.target.checked) siguiente.add(gasto.id);
                      else siguiente.delete(gasto.id);
                      return siguiente;
                    })}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{gasto.concepto}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(`${gasto.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                      {' · '}{nombreCuenta(gasto.cuenta_origen_id)}
                      {' · '}{metodosConfig[gasto.metodo_pago]}
                      {gasto.creado_por ? ` · ${gasto.creado_por}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-600">-{formatMoney(gasto.monto)}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowRecuperar(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={recuperarGastos}
                disabled={aRecuperar.size === 0}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Recuperar {aRecuperar.size} {aRecuperar.size === 1 ? 'gasto' : 'gastos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
