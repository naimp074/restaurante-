import { useState } from 'react';
import { X, Lock, Unlock, Wallet, ArrowLeftRight, Receipt, PiggyBank, HandCoins, ChevronDown } from 'lucide-react';
import type { CajaDiaria, CuentaDinero, MetodoPago, MovimientoFinanciero, Pago } from '../lib/types';
import { etiquetaPedido } from '../lib/pedidosCanal';
import { gastosDeCategoria, resumenGastosCaja, type CategoriaGastoCaja } from '../lib/resumenGastosCaja';

export interface ApartadoArqueo {
  id: string;
  fecha: string;
  nombre: string;
  monto: number;
  observaciones: string;
}

interface Props {
  caja: CajaDiaria;
  pagos: Pago[];
  movimientos: MovimientoFinanciero[];
  apartados: ApartadoArqueo[];
  cuentas: CuentaDinero[];
  /** Cierre a ciegas (cajero): no ve lo esperado ni las diferencias. */
  aCiegas: boolean;
  onClose: () => void;
}

const dinero = (valor: number) =>
  `$${valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const hora = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';

const fechaHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const nombresMetodo: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  debito: 'Débito',
  credito: 'Crédito',
  mercado_pago: 'Mercado Pago',
  mixto: 'Mixto',
};

const nombresOrigen: Record<MovimientoFinanciero['origen'], string> = {
  venta: 'Venta',
  cobro_cuenta_corriente: 'Cobro cuenta corriente',
  gasto: 'Gasto',
  pago_proveedor: 'Pago a proveedor',
  compra: 'Compra',
  apertura_caja: 'Apertura de caja',
  retiro: 'Retiro',
  transferencia_interna: 'Movimiento entre cuentas',
  ajuste: 'Ajuste',
};

/** Los cobros que entraron mientras esta caja estuvo abierta. */
const pagosDeLaCaja =(caja: CajaDiaria, pagos: Pago[]) => {
  const desde = caja.opened_at;
  const hasta = caja.closed_at;
  return pagos
    .filter(pago => pago.created_at >= desde && (!hasta || pago.created_at <= hasta))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
};

/**
 * Los gastos y movimientos hechos mientras esta caja estuvo abierta (de la apertura al cierre),
 * no todo lo del día ni lo acumulado: así cada turno ve solo lo suyo.
 */
const movimientosDeLaCaja = (caja: CajaDiaria, movimientos: MovimientoFinanciero[]) => {
  const desde = caja.opened_at;
  const hasta = caja.closed_at;
  if (!desde) return movimientos.filter(mov => mov.fecha === caja.fecha);
  return movimientos.filter(mov => mov.created_at
    ? mov.created_at >= desde && (!hasta || mov.created_at <= hasta)
    : mov.fecha === caja.fecha);
};

function Diferencia({ valor, esperado }: { valor?: number; esperado?: number }) {
  if (valor === undefined) return <span className="text-slate-400">—</span>;
  // Esperado negativo: se anotaron más salidas de efectivo que lo que había. No puede "sobrar".
  if (esperado !== undefined && esperado < -0.009) {
    return (
      <span className="font-semibold text-red-600" title="Se anotaron más gastos en efectivo que el efectivo que había en la caja">
        Faltan {dinero(-esperado)}
      </span>
    );
  }
  if (Math.abs(valor) < 0.01) return <span className="font-semibold text-emerald-600">Justo</span>;
  return (
    <span className={`font-semibold ${valor < 0 ? 'text-red-600' : 'text-amber-600'}`}>
      {valor < 0 ? `Faltan ${dinero(-valor)}` : `Sobran ${dinero(valor)}`}
    </span>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: React.ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={fuerte ? 'font-bold text-slate-800' : 'text-slate-700'}>{valor}</span>
    </div>
  );
}

type RenglonGasto = CategoriaGastoCaja | 'total';

const renglonesGasto: { id: RenglonGasto; label: string }[] = [
  { id: 'efectivo', label: 'Gastos en efectivo' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'otros', label: 'Otros (retiros, sin medio anotado)' },
  { id: 'total', label: 'Total gastado' },
];

export default function DetalleArqueo({ caja, pagos, movimientos, apartados, cuentas, aCiegas, onClose }: Props) {
  const cobros = pagosDeLaCaja(caja, pagos);
  const movimientosDelDia = movimientosDeLaCaja(caja, movimientos)
    .filter(mov => mov.origen !== 'venta')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const gastosDelDia = resumenGastosCaja(movimientosDelDia);
  // Renglón de "Gastos del día" desplegado para ver los gastos uno por uno.
  const [gastoAbierto, setGastoAbierto] = useState<RenglonGasto | null>(null);
  const apartadosDelDia = apartados.filter(apartado => apartado.fecha === caja.fecha);
  const nombreCuenta = (id?: string) => cuentas.find(cuenta => cuenta.id === id)?.nombre || '—';
  const abierta = caja.estado === 'abierta';
  const quienCerro = caja.cerrado_por_nombre?.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label={`Arqueo del ${caja.fecha}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Arqueo del {new Date(`${caja.fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${abierta ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {abierta ? 'Caja abierta' : 'Caja cerrada'}
            </span>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          {/* Quién abrió y quién cerró */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500"><Unlock size={13} />Abrió la caja</p>
              <p className="font-semibold text-slate-800">{caja.cajero_nombre?.trim() || 'Sin registrar'}</p>
              <p className="text-xs text-slate-500">{fechaHora(caja.opened_at)} · fondo inicial {dinero(caja.monto_inicial)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock size={13} />Cerró la caja</p>
              {abierta ? (
                <p className="font-semibold text-emerald-700">Todavía abierta</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-800">{quienCerro || 'No quedó registrado'}</p>
                  <p className="text-xs text-slate-500">
                    {fechaHora(caja.closed_at)}
                    {!quienCerro && ' · cierre anterior a este registro'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Con cuánto cerró */}
          {!abierta && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Wallet size={15} />Con cuánto cerró</h4>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold"></th>
                      {!aCiegas && <th className="px-3 py-2 text-right font-semibold">Esperado</th>}
                      <th className="px-3 py-2 text-right font-semibold">Contado</th>
                      {!aCiegas && <th className="px-3 py-2 text-right font-semibold">Diferencia</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="px-3 py-2 text-slate-600">Efectivo</td>
                      {!aCiegas && <td className="px-3 py-2 text-right">{dinero(caja.monto_esperado_efectivo)}</td>}
                      <td className="px-3 py-2 text-right font-semibold">{caja.monto_cierre_efectivo !== undefined ? dinero(caja.monto_cierre_efectivo) : '—'}</td>
                      {!aCiegas && <td className="px-3 py-2 text-right"><Diferencia valor={caja.diferencia_efectivo} esperado={caja.monto_esperado_efectivo} /></td>}
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-600">Transferencia</td>
                      {!aCiegas && <td className="px-3 py-2 text-right">{dinero(caja.transferencia)}</td>}
                      <td className="px-3 py-2 text-right font-semibold">{caja.monto_cierre_transferencia !== undefined ? dinero(caja.monto_cierre_transferencia) : '—'}</td>
                      {!aCiegas && <td className="px-3 py-2 text-right"><Diferencia valor={caja.diferencia_transferencia} /></td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Ventas del día */}
          {!aCiegas && (
            <section>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Receipt size={15} />Ventas del día</h4>
              <div className="divide-y divide-slate-50 rounded-xl border border-slate-100 px-3">
                <Fila label="Fondo inicial" valor={dinero(caja.monto_inicial)} />
                <Fila label="Efectivo" valor={dinero(caja.efectivo)} />
                <Fila label="Tarjeta" valor={dinero(caja.tarjeta)} />
                <Fila label="Transferencia" valor={dinero(caja.transferencia)} />
                {!!caja.ventas_cuenta_corriente && <Fila label="Fiado a cuenta corriente" valor={dinero(caja.ventas_cuenta_corriente)} />}
                {!!caja.cobros_cuenta_corriente && <Fila label="Cobros de cuenta corriente" valor={dinero(caja.cobros_cuenta_corriente)} />}
                <Fila label="Total vendido" valor={dinero(caja.total_ventas)} fuerte />
              </div>
            </section>
          )}

          {/* En qué se gastó: el detalle uno por uno está más abajo, en Movimientos de plata */}
          {!aCiegas && (
            <section>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><HandCoins size={15} />Gastos del día</h4>
              <div className="divide-y divide-slate-50 rounded-xl border border-slate-100 px-3">
                {renglonesGasto
                  .filter(renglon => renglon.id !== 'otros' || gastosDelDia.otros > 0)
                  .map(renglon => {
                    const abierto = gastoAbierto === renglon.id;
                    const lista = abierto ? gastosDeCategoria(movimientosDelDia, renglon.id) : [];
                    const total = renglon.id === 'total';
                    return (
                      <div key={renglon.id}>
                        <button
                          type="button"
                          onClick={() => setGastoAbierto(abierto ? null : renglon.id)}
                          aria-expanded={abierto}
                          className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-1 text-slate-500">
                            <ChevronDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
                            {renglon.label}
                          </span>
                          <span className={total ? 'font-bold text-slate-800' : 'text-slate-700'}>{dinero(gastosDelDia[renglon.id])}</span>
                        </button>
                        {abierto && (
                          <div className="mb-2 rounded-lg bg-slate-50 px-2 py-1">
                            {lista.length === 0 ? (
                              <p className="py-1.5 text-xs text-slate-400">No hubo gastos acá.</p>
                            ) : lista.map(mov => (
                              <div key={mov.id} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                                <div className="min-w-0">
                                  <p className="text-slate-700">{mov.descripcion || nombresOrigen[mov.origen]}</p>
                                  <p className="text-slate-400">
                                    {hora(mov.created_at)}
                                    {mov.metodo_pago && ` · ${nombresMetodo[mov.metodo_pago] || mov.metodo_pago}`}
                                    {` · ${nombreCuenta(mov.cuenta_id)}`}
                                    {mov.creado_por && ` · ${mov.creado_por}`}
                                  </p>
                                </div>
                                <span className="whitespace-nowrap font-semibold text-red-600">−{dinero(mov.monto)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Cobros uno por uno */}
          {!aCiegas && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Cobros ({cobros.length})</h4>
              {cobros.length === 0 ? (
                <p className="text-sm text-slate-400">No hubo cobros en esta caja.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-50">
                      {cobros.map(pago => (
                        <tr key={pago.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{hora(pago.created_at)}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {pago.pedido ? etiquetaPedido(pago.pedido) : 'Cobro'}
                            {pago.comprador_nombre && <span className="text-slate-400"> · {pago.comprador_nombre}</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{nombresMetodo[pago.metodo_pago] || pago.metodo_pago}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{dinero(pago.total_cobrado ?? pago.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Gastos, pagos y movimientos de plata */}
          {!aCiegas && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ArrowLeftRight size={15} />Movimientos de plata del día</h4>
              {movimientosDelDia.length === 0 ? (
                <p className="text-sm text-slate-400">Sin gastos, pagos ni movimientos entre cuentas.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-50">
                      {movimientosDelDia.map(mov => (
                        <tr key={mov.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{hora(mov.created_at)}</td>
                          <td className="px-3 py-2">
                            <p className="text-slate-700">{mov.descripcion || nombresOrigen[mov.origen]}</p>
                            <p className="text-xs text-slate-400">
                              {nombresOrigen[mov.origen]} · {nombreCuenta(mov.cuenta_id)}
                              {mov.cuenta_destino_id && ` → ${nombreCuenta(mov.cuenta_destino_id)}`}
                              {mov.creado_por && ` · ${mov.creado_por}`}
                            </p>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${mov.tipo === 'salida' ? 'text-red-600' : mov.tipo === 'entrada' ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {mov.tipo === 'salida' ? '−' : mov.tipo === 'entrada' ? '+' : ''}{dinero(mov.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Dónde quedó la plata */}
          {apartadosDelDia.length > 0 && (
            <section>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><PiggyBank size={15} />Dónde quedó la plata</h4>
              <div className="divide-y divide-slate-50 rounded-xl border border-slate-100 px-3">
                {apartadosDelDia.map(apartado => (
                  <Fila
                    key={apartado.id}
                    label={apartado.observaciones ? `${apartado.nombre} · ${apartado.observaciones}` : apartado.nombre}
                    valor={dinero(apartado.monto)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
