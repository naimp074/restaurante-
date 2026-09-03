import { useEffect, useState } from 'react';
import { Plus, ReceiptText, Wallet, CalendarDays, Trash2, X, Check } from 'lucide-react';
import type { AlcanceGasto, CajaDiaria, CategoriaGasto, CuentaDinero, Gasto, MetodoPago, Proveedor, TipoCuentaDinero } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { loadCuentasDinero, registrarEntradaCuenta, registrarSalidaCuenta, saveCuentasDinero } from '../lib/finance';
import { mockProveedores } from '../lib/mockData';

const gastosStorageKey = 'restaurant-gastos';
const cajaStorageKey = 'restaurant-cajas-diarias';

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
  debito: 'Débito',
  credito: 'Crédito',
  mixto: 'Mixto',
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const loadGastos = (): Gasto[] => {
  try {
    const saved = window.localStorage.getItem(gastosStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Gasto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

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

export default function Gastos() {
  const { user } = useAuth();
  const [gastos, setGastos] = useState<Gasto[]>(loadGastos);
  const [cajas] = useState<CajaDiaria[]>(loadCajas);
  const [cuentas, setCuentas] = useState<CuentaDinero[]>(loadCuentasDinero);
  const [proveedores] = useState<Proveedor[]>(mockProveedores);
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

  const cajaHoy = cajas.find(caja => caja.fecha === todayKey() && caja.estado === 'abierta') || null;
  const gastosHoy = gastos.filter(gasto => gasto.fecha === todayKey());
  const gastosCajaHoy = gastosHoy.filter(gasto => gasto.alcance === 'caja_dia');
  const totalGastosHoy = gastosHoy.reduce((sum, gasto) => sum + gasto.monto, 0);
  const totalDescuentoCajaHoy = gastosCajaHoy.reduce((sum, gasto) => sum + gasto.monto, 0);
  const gastosPendientes = gastos.filter(gasto => (gasto.estado || 'pagado') !== 'pagado');
  const totalPendiente = gastosPendientes.reduce((sum, gasto) => sum + gasto.monto, 0);
  const disponibleCajaHoy = (cajaHoy?.monto_esperado_efectivo ?? 0) + (cajaHoy?.tarjeta ?? 0) + (cajaHoy?.transferencia ?? 0) - totalDescuentoCajaHoy;
  const gastosFiltrados = gastos
    .filter(gasto => filtroEstado === 'todos' || (gasto.estado || 'pagado') === filtroEstado)
    .filter(gasto => filtroCuenta === 'todos' || gasto.cuenta_origen_id === filtroCuenta || gasto.pagos_divididos?.some(parte => parte.cuenta_id === filtroCuenta));

  useEffect(() => {
    window.localStorage.setItem(gastosStorageKey, JSON.stringify(gastos));
  }, [gastos]);

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
      id: `gasto-${Date.now()}`,
      fecha,
      concepto: concepto.trim(),
      categoria,
      alcance,
      metodo_pago: metodoPago,
      monto: parsedMonto,
      observaciones: observaciones.trim(),
      created_at: new Date().toISOString(),
      creado_por: user ? `${user.nombre} ${user.apellido}` : undefined,
      cuenta_origen_id: cuentaOrigenId,
      pagos_divididos: metodoPago === 'mixto' ? [
        { metodo_pago: 'efectivo', cuenta_id: cuentaEfectivoId, monto: efectivoMixto },
        { metodo_pago: 'transferencia', cuenta_id: cuentaTransferenciaId, monto: transferenciaMixta },
      ] : undefined,
      proveedor_id: proveedorId || undefined,
      comprobante: comprobante.trim(),
      estado,
      vencimiento,
      recurrente,
    };

    setGastos(prev => [gasto, ...prev]);
    if (estado === 'pagado' && metodoPago === 'mixto') {
      gasto.pagos_divididos?.forEach(parte => registrarSalidaCuenta({
        cuenta_id: parte.cuenta_id, monto: parte.monto,
        descripcion: `${gasto.concepto} (${metodosConfig[parte.metodo_pago]})`, origen: 'gasto', fecha,
        metodo_pago: parte.metodo_pago, proveedor_id: proveedorId || undefined, creado_por: gasto.creado_por,
      }));
      setCuentas(loadCuentasDinero());
    } else if (estado === 'pagado' && cuentaOrigenId) {
      registrarSalidaCuenta({
        cuenta_id: cuentaOrigenId,
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
      id: `cuenta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    setShowNuevaCuenta(false);
    setNuevaCuentaNombre('');
    setNuevaCuentaTipo('efectivo');
    setNuevaCuentaSaldo('');
    setNuevaCuentaError('');
  };

  const deleteGasto = (gastoId: string) => {
    const gasto = gastos.find(item => item.id === gastoId);
    if ((gasto?.estado || 'pagado') === 'pagado' && gasto?.pagos_divididos?.length) {
      gasto.pagos_divididos.forEach(parte => registrarEntradaCuenta({
        cuenta_id: parte.cuenta_id, monto: parte.monto,
        descripcion: `Anulacion de gasto: ${gasto.concepto} (${metodosConfig[parte.metodo_pago]})`,
        origen: 'ajuste', fecha: todayKey(),
      }));
      setCuentas(loadCuentasDinero());
    } else if ((gasto?.estado || 'pagado') === 'pagado' && gasto?.cuenta_origen_id) {
      registrarEntradaCuenta({
        cuenta_id: gasto.cuenta_origen_id,
        monto: gasto.monto,
        descripcion: `Anulacion de gasto: ${gasto.concepto}`,
        origen: 'ajuste',
        fecha: todayKey(),
      });
      setCuentas(loadCuentasDinero());
    }
    setGastos(prev => prev.filter(item => item.id !== gastoId));
  };

  const totalByCategoria = (target: CategoriaGasto) =>
    gastosHoy.filter(gasto => gasto.categoria === target).reduce((sum, gasto) => sum + gasto.monto, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
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

      <div className="grid grid-cols-4 gap-4">
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
          <h2 className="font-semibold text-slate-800">Gastos</h2>
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
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-red-600">-{formatMoney(gasto.monto)}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => deleteGasto(gasto.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Eliminar gasto"
                      >
                        <Trash2 size={14} />
                      </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                  <div className="grid grid-cols-[130px_1fr_160px] gap-3 items-end">
                    <div className="pb-2 text-sm font-semibold text-slate-700">Efectivo</div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Cuenta</label><select value={cuentaEfectivoId} onChange={e => setCuentaEfectivoId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">{cuentas.filter(cuenta => cuenta.activa && cuenta.tipo === 'efectivo').map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre} - {formatMoney(cuenta.saldo)}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Importe</label><input type="number" min="0" value={montoEfectivo} onChange={e => { setMontoEfectivo(e.target.value); setGastoError(''); }} placeholder="$ 0" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right outline-none focus:border-amber-400" /></div>
                  </div>
                  <div className="grid grid-cols-[130px_1fr_160px] gap-3 items-end">
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
                  <div className="grid grid-cols-3 gap-3">
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
