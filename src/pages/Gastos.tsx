import { useEffect, useState } from 'react';
import { Plus, ReceiptText, Wallet, CalendarDays, Trash2, X, Check, ArrowLeft, ArrowLeftRight, Landmark, Smartphone, CreditCard, Banknote } from 'lucide-react';
import type { AlcanceGasto, CategoriaGasto, CuentaDinero, Gasto, MetodoPago, PageId, Proveedor, TipoCuentaDinero } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import {
  cuentaBancoId,
  cuentaCajaDiaId,
  cuentaCajaGrandeId,
  loadCuentasDinero,
  loadMovimientosFinancieros,
  registrarEntradaCuenta,
  registrarSalidaCuenta,
  saveCuentasDinero,
  transferirEntreCuentas,
} from '../lib/finance';
import { loadProveedores } from '../lib/proveedoresStore';
import { dayKey } from '../lib/fechas';
import { saveGastos, useGastos } from '../lib/gastosStore';
import { aplicarGastoEnCajaDia, useCajas } from '../lib/cajaStore';
import { nuevoId } from '../lib/ids';

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
  mixto: 'Mixto',
};

const todayKey = () => dayKey();

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

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

export default function Gastos({ apartadoInicial, onNavigate }: GastosProps) {
  const { user } = useAuth();
  const gastos = useGastos();
  const cajas = useCajas();
  const apartado = apartadoInicial || null;
  const [cuentas, setCuentas] = useState<CuentaDinero[]>(loadCuentasDinero);
  const [movimientos, setMovimientos] = useState(loadMovimientosFinancieros);
  const [proveedores] = useState<Proveedor[]>(loadProveedores);
  const [showForm, setShowForm] = useState(false);
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
  const [showNuevaCuenta, setShowNuevaCuenta] = useState(false);
  const [nuevaCuentaNombre, setNuevaCuentaNombre] = useState('');
  const [nuevaCuentaTipo, setNuevaCuentaTipo] = useState<TipoCuentaDinero>('efectivo');
  const [nuevaCuentaSaldo, setNuevaCuentaSaldo] = useState('');
  const [nuevaCuentaError, setNuevaCuentaError] = useState('');
  const [cuentaAbiertaId, setCuentaAbiertaId] = useState<string | null>(null);
  const [traspasoDestinoId, setTraspasoDestinoId] = useState(cuentaBancoId);
  const [traspasoMonto, setTraspasoMonto] = useState('');
  const [traspasoError, setTraspasoError] = useState('');

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

  const cajaHoy = cajas.find(caja => caja.fecha === todayKey() && caja.estado === 'abierta') || null;
  const gastosHoy = gastos.filter(gasto => gasto.fecha === todayKey());
  const totalGastosHoy = gastosHoy.reduce((sum, gasto) => sum + gasto.monto, 0);
  const totalDescuentoCajaHoy = movimientos
    .filter(mov => mov.fecha === todayKey() && mov.tipo === 'salida' && mov.cuenta_id === cuentaCajaDiaId)
    .reduce((sum, mov) => sum + mov.monto, 0);
  const gastosPendientes = gastos.filter(gasto => (gasto.estado || 'pagado') !== 'pagado');
  const totalPendiente = gastosPendientes.reduce((sum, gasto) => sum + Math.max(0, gasto.monto - (gasto.monto_pagado || 0)), 0);
  const disponibleCajaHoy = (cajaHoy?.monto_esperado_efectivo ?? 0) + (cajaHoy?.tarjeta ?? 0) + (cajaHoy?.transferencia ?? 0);
  const gastosFiltrados = gastos
    .filter(gasto => filtroEstado === 'todos' || (gasto.estado || 'pagado') === filtroEstado)
    .filter(gasto => filtroCuenta === 'todos' || gasto.cuenta_origen_id === filtroCuenta || gasto.pagos_divididos?.some(parte => parte.cuenta_id === filtroCuenta));

  const resetForm = () => {
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
  };

  const saveGasto = () => {
    const parsedMonto = parseFloat(monto);
    if (!concepto.trim() || !parsedMonto || parsedMonto <= 0) {
      setGastoError('Completá el concepto y un monto mayor que cero.');
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

    const gasto: Gasto = {
      id: nuevoId('gasto'),
      fecha,
      concepto: concepto.trim(),
      categoria,
      alcance,
      metodo_pago: metodoPago,
      monto: parsedMonto,
      observaciones: observaciones.trim(),
      created_at: new Date().toISOString(),
      creado_por: user ? `${user.nombre} ${user.apellido}` : undefined,
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
    };

    saveGastos([gasto, ...gastos]);
    const efectivoCajaDia = estado === 'pagado' && alcance === 'caja_dia' && (metodoPago === 'efectivo' || metodoPago === 'mixto');
    const montoEfectivoCaja = metodoPago === 'mixto' ? efectivoMixto : metodoPago === 'efectivo' ? parsedMonto : 0;
    if (efectivoCajaDia && montoEfectivoCaja > 0) aplicarGastoEnCajaDia(fecha, montoEfectivoCaja, 1);
    if (estado === 'pagado' && metodoPago === 'mixto') {
      gasto.pagos_divididos?.forEach(parte => registrarSalidaCuenta({
        cuenta_id: alcance === 'caja_dia' && parte.metodo_pago === 'efectivo' ? cuentaCajaDiaId : parte.cuenta_id,
        monto: parte.monto,
        descripcion: `${gasto.concepto} (${metodosConfig[parte.metodo_pago]})`, origen: 'gasto', fecha,
        metodo_pago: parte.metodo_pago, proveedor_id: proveedorId || undefined, creado_por: gasto.creado_por,
      }));
      setCuentas(loadCuentasDinero());
    } else if (estado === 'pagado' && cuentaOrigenId) {
      registrarSalidaCuenta({
        cuenta_id: alcance === 'caja_dia' && metodoPago === 'efectivo' ? cuentaCajaDiaId : cuentaOrigenId,
        monto: parsedMonto,
        descripcion: gasto.concepto,
        origen: 'gasto',
        fecha,
        metodo_pago: metodoPago,
        proveedor_id: proveedorId || undefined,
        creado_por: gasto.creado_por,
      });
      setCuentas(loadCuentasDinero());
    }
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

  const deleteGasto = (gastoId: string) => {
    const gasto = gastos.find(item => item.id === gastoId);
    if (gasto?.compra_id) return;
    if ((gasto?.estado || 'pagado') === 'pagado' && gasto?.pagos_divididos?.length) {
      gasto.pagos_divididos.forEach(parte => registrarEntradaCuenta({
        cuenta_id: parte.cuenta_id, monto: parte.monto,
        descripcion: `Anulacion de gasto: ${gasto.concepto} (${metodosConfig[parte.metodo_pago]})`,
        origen: 'ajuste', fecha: todayKey(),
      }));
      setCuentas(loadCuentasDinero());
    } else if ((gasto?.estado || 'pagado') === 'pagado' && gasto?.cuenta_origen_id) {
      registrarEntradaCuenta({
        cuenta_id: gasto.alcance === 'caja_dia' && gasto.metodo_pago === 'efectivo' ? cuentaCajaDiaId : gasto.cuenta_origen_id,
        monto: gasto.monto,
        descripcion: `Anulacion de gasto: ${gasto.concepto}`,
        origen: 'ajuste',
        fecha: todayKey(),
      });
      setCuentas(loadCuentasDinero());
    }
    if (gasto && (gasto.estado || 'pagado') === 'pagado' && gasto.alcance === 'caja_dia') {
      const efectivo = gasto.metodo_pago === 'mixto'
        ? (gasto.pagos_divididos?.find(parte => parte.metodo_pago === 'efectivo')?.monto || 0)
        : gasto.metodo_pago === 'efectivo' ? gasto.monto : 0;
      if (efectivo > 0) aplicarGastoEnCajaDia(gasto.fecha, efectivo, -1);
    }
    saveGastos(gastos.filter(item => item.id !== gastoId));
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
    transferirEntreCuentas({
      cuenta_origen_id: origenId,
      cuenta_destino_id: traspasoDestinoId,
      monto: montoNum,
      descripcion: `Traspaso de ${origen.nombre} a ${destino.nombre}`,
      fecha,
    });
    if (origenId === cuentaCajaDiaId) aplicarGastoEnCajaDia(fecha, montoNum, 1);
    if (traspasoDestinoId === cuentaCajaDiaId) aplicarGastoEnCajaDia(fecha, montoNum, -1);
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
            <p className="text-slate-300 text-sm mt-1">Elegí si vas a pagar algo o a mover plata entre cuentas.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
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
        </div>
      </div>
    );
  }

  if (apartado === 'traspasos') {
    const totalCuentas = cuentasActivas.reduce((sum, cuenta) => sum + cuenta.saldo, 0);
    const destinoSeleccionado = destinosTraspaso.find(cuenta => cuenta.id === traspasoDestinoId);
    const movimientosCuenta = cuentaAbierta
      ? movimientos.filter(movimiento =>
          movimiento.origen === 'transferencia_interna'
          && (movimiento.cuenta_id === cuentaAbierta.id || movimiento.cuenta_destino_id === cuentaAbierta.id)
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
                  const sale = movimiento.cuenta_id === cuentaAbierta.id;
                  const destino = nombreCuenta(sale ? movimiento.cuenta_destino_id : movimiento.cuenta_id);
                  return (
                    <div key={movimiento.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        {sale ? `A ${destino}` : `De ${destino}`}
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
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Plus size={14} />
          Nuevo gasto
        </button>
      </div>

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
                      {gasto.compra_id ? <span className="text-xs text-slate-400">Compra de stock</span> : <button
                        onClick={() => deleteGasto(gasto.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Eliminar gasto"
                      >
                        <Trash2 size={14} />
                      </button>}
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
                <h3 className="font-bold text-slate-800">Nuevo gasto</h3>
                <p className="text-sm text-slate-500">El gasto se descontará según el alcance elegido</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto *</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
                  <ReceiptText size={15} className="text-slate-400" />
                  <input
                    value={concepto}
                    onChange={e => setConcepto(e.target.value)}
                    className="flex-1 text-sm outline-none"
                    placeholder="Ej: sueldo, alquiler, arreglo, compra extra"
                  />
                </div>
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Método</label>
                  <select
                    value={metodoPago}
                    onChange={e => { setMetodoPago(e.target.value as MetodoPago); setGastoError(''); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    {(Object.keys(metodosConfig) as MetodoPago[]).map(key => (
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
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveGasto}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Guardar gasto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
