import type { Gasto, Profile } from './types';
import { dayKey } from './fechas';
import { loadGastos, saveGastos } from './gastosStore';
import { aplicarGastoEnCajaDia } from './cajaStore';
import { registrarSalidaCuenta } from './finance';
import { withStoreTransaction } from './storeSync';
import { nuevoId } from './ids';

export type EstadoSueldo = 'pagado' | 'parcial' | 'sin_pagar' | 'sin_sueldo';

export interface MesSueldo {
  periodo: string;
  sueldo: number;
  pagado: number;
  resta: number;
  estado: EstadoSueldo;
  pagos: Gasto[];
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/** Mes de la jornada actual, YYYY-MM. */
export const periodoActual = () => dayKey().slice(0, 7);

const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11" → "noviembre 2026". */
export const nombrePeriodo = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return meses[mes - 1] ? `${meses[mes - 1]} ${anio}` : periodo;
};

const mesSiguiente = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
};

export const nombreUsuario = (usuario: Pick<Profile, 'nombre' | 'apellido'>) =>
  `${usuario.nombre} ${usuario.apellido || ''}`.trim();

/** Solo cuenta lo que ya salió de una cuenta: un sueldo cargado como pendiente todavía se debe. */
export const pagosDeSueldo = (gastos: Gasto[], empleadoId: string) =>
  gastos.filter(g => g.categoria === 'sueldo' && g.empleado_id === empleadoId && (g.estado || 'pagado') === 'pagado' && g.periodo);

export const mesDeSueldo = (usuario: Pick<Profile, 'id' | 'sueldo'>, gastos: Gasto[], periodo: string): MesSueldo => {
  const pagos = pagosDeSueldo(gastos, usuario.id).filter(g => g.periodo === periodo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  // Mes ya pagado: vale el sueldo que tenía entonces. Mes sin pagos: el sueldo de hoy.
  const sueldo = pagos.find(p => p.sueldo_mes !== undefined)?.sueldo_mes ?? usuario.sueldo ?? 0;
  const pagado = redondear(pagos.reduce((suma, p) => suma + p.monto, 0));
  const resta = redondear(Math.max(0, sueldo - pagado));
  const estado: EstadoSueldo = sueldo <= 0
    ? (pagado > 0 ? 'pagado' : 'sin_sueldo')
    : resta <= 0 ? 'pagado' : pagado > 0 ? 'parcial' : 'sin_pagar';
  return { periodo, sueldo, pagado, resta, estado, pagos };
};

/**
 * Estado de cuenta: desde el primer mes en que se le pagó hasta hoy, del más nuevo al más viejo.
 * Arranca en el primer pago (no en el alta) para no mostrar como deuda los meses de antes de usar el sistema.
 */
export const estadoDeCuenta = (usuario: Pick<Profile, 'id' | 'sueldo'>, gastos: Gasto[], hasta = periodoActual()) => {
  const periodos = pagosDeSueldo(gastos, usuario.id).map(g => g.periodo as string);
  const ultimo = periodos.reduce((max, p) => (p > max ? p : max), hasta);
  let periodo = periodos.reduce((min, p) => (p < min ? p : min), hasta);
  const lista: MesSueldo[] = [];
  for (let vueltas = 0; periodo <= ultimo && vueltas < 240; vueltas += 1) {
    lista.push(mesDeSueldo(usuario, gastos, periodo));
    periodo = mesSiguiente(periodo);
  }
  const meses = lista.reverse();
  return {
    meses,
    totalPagado: redondear(meses.reduce((s, m) => s + m.pagado, 0)),
    totalAdeudado: redondear(meses.reduce((s, m) => s + m.resta, 0)),
  };
};

/**
 * Guarda el gasto y, si está pagado, descuenta la plata de su cuenta (y de la caja del día si
 * salió de ahí en efectivo). Es lo que hace "Nuevo gasto"; el pago rápido de sueldo usa lo mismo.
 */
export const registrarGasto = (gasto: Gasto) => withStoreTransaction(() => {
  saveGastos([gasto, ...loadGastos()]);
  if ((gasto.estado || 'pagado') !== 'pagado') return gasto;
  const efectivoCaja = gasto.alcance === 'caja_dia'
    ? gasto.metodo_pago === 'mixto'
      ? gasto.pagos_divididos?.find(parte => parte.metodo_pago === 'efectivo')?.monto || 0
      : gasto.metodo_pago === 'efectivo' ? gasto.monto : 0
    : 0;
  if (efectivoCaja > 0) aplicarGastoEnCajaDia(gasto.fecha, efectivoCaja, 1);
  if (gasto.metodo_pago === 'mixto' && gasto.pagos_divididos?.length) {
    gasto.pagos_divididos.forEach(parte => registrarSalidaCuenta({
      cuenta_id: parte.cuenta_id,
      monto: parte.monto,
      descripcion: `${gasto.concepto} (${parte.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'})`,
      origen: 'gasto', fecha: gasto.fecha, metodo_pago: parte.metodo_pago,
      proveedor_id: gasto.proveedor_id, creado_por: gasto.creado_por,
    }));
  } else if (gasto.cuenta_origen_id) {
    registrarSalidaCuenta({
      cuenta_id: gasto.cuenta_origen_id,
      monto: gasto.monto,
      descripcion: gasto.concepto,
      origen: 'gasto', fecha: gasto.fecha, metodo_pago: gasto.metodo_pago,
      proveedor_id: gasto.proveedor_id, creado_por: gasto.creado_por,
    });
  }
  return gasto;
});

export interface DatosPagoSueldo {
  usuario: Profile;
  periodo: string;
  monto: number;
  fecha: string;
  metodo_pago: 'efectivo' | 'transferencia';
  cuenta_id: string;
  /** Si sale en efectivo de la caja del día, baja también lo esperado en el arqueo. */
  desde_caja_dia: boolean;
  cuenta_caja_dia_id: string;
  observaciones?: string;
  creado_por?: string;
}

export const pagarSueldo = (datos: DatosPagoSueldo): Gasto => {
  const monto = redondear(Number(datos.monto) || 0);
  if (monto <= 0) throw new Error('Ingresá un monto mayor que cero.');
  if (!/^\d{4}-\d{2}$/.test(datos.periodo)) throw new Error('Elegí el mes que se paga.');
  const enCaja = datos.desde_caja_dia && datos.metodo_pago === 'efectivo';
  const cuenta = enCaja ? datos.cuenta_caja_dia_id : datos.cuenta_id;
  if (!cuenta) throw new Error('Elegí de qué cuenta sale la plata.');
  return registrarGasto({
    id: nuevoId('gasto'),
    fecha: datos.fecha,
    concepto: `Sueldo ${nombreUsuario(datos.usuario)} · ${nombrePeriodo(datos.periodo)}`,
    categoria: 'sueldo',
    alcance: enCaja ? 'caja_dia' : 'general',
    metodo_pago: datos.metodo_pago,
    monto,
    observaciones: (datos.observaciones || '').trim(),
    created_at: new Date().toISOString(),
    creado_por: datos.creado_por,
    cuenta_origen_id: cuenta,
    comprobante: '',
    estado: 'pagado',
    vencimiento: datos.fecha,
    recurrente: false,
    empleado_id: datos.usuario.id,
    periodo: datos.periodo,
    sueldo_mes: datos.usuario.sueldo,
  });
};
