import type { Fichada, Gasto, Profile } from './types';
import { readStore, useStore, withStoreTransaction, writeStore } from './storeSync';
import { loadGastos } from './gastosStore';
import { loadCajasDiarias } from './cajaStore';
import { cajaAbiertaActual } from './esperadoCaja';
import { cuentaBancoId, cuentaCajaDiaId, cuentaCajaGrandeId } from './finance';
import { dayKey } from './fechas';
import { nuevoId } from './ids';
import { nombreUsuario, pagarSueldo } from './sueldos';

export const fichadasStorageKey = 'restaurant-fichadas';
export const fichadasUpdatedEvent = 'restaurant-fichadas-updated';

export const loadFichadas = () => readStore<Fichada[]>(fichadasStorageKey, []);
export const saveFichadas = (fichadas: Fichada[]) => writeStore(fichadasStorageKey, fichadas, fichadasUpdatedEvent);
export const useFichadas = () => useStore(fichadasUpdatedEvent, loadFichadas);

const minuto = 60 * 1000;

/** Minutos trabajados. Si todavía no salió, cuenta hasta ahora. */
export const minutosDe = (fichada: Pick<Fichada, 'entrada' | 'salida'>, ahora = new Date()) => {
  const fin = fichada.salida ? new Date(fichada.salida).getTime() : ahora.getTime();
  return Math.max(0, Math.floor((fin - new Date(fichada.entrada).getTime()) / minuto));
};

/** 510 → "8 h 30 min". */
export const textoHoras = (minutos: number) => {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${String(resto).padStart(2, '0')} min` : `${horas} h`;
};

/** Lo que gana por hora en ese turno: el valor que tenía al entrar o, si no tenía, el de hoy. */
export const valorHoraDe = (fichada: Pick<Fichada, 'valor_hora'>, usuario?: Pick<Profile, 'valor_hora'>) =>
  fichada.valor_hora && fichada.valor_hora > 0 ? fichada.valor_hora : usuario?.valor_hora || 0;

/** Lo ganado en los turnos, por los minutos exactos. Redondeado al peso. */
export const montoDe = (fichadas: Fichada[], usuario?: Pick<Profile, 'valor_hora'>, ahora = new Date()) =>
  Math.round(fichadas.reduce((suma, f) => suma + (minutosDe(f, ahora) / 60) * valorHoraDe(f, usuario), 0));

/**
 * Pagada si el gasto con que se pagó sigue existiendo. Si borran ese pago en Gastos → Pagos,
 * las horas vuelven a quedar para pagar.
 */
export const estaPagada = (fichada: Fichada, gastos: Gasto[]) =>
  Boolean(fichada.gasto_id && gastos.some(g => g.id === fichada.gasto_id));

export const turnoAbierto = (fichadas: Fichada[], empleadoId: string) =>
  fichadas.find(f => f.empleado_id === empleadoId && !f.salida);

/** Turnos terminados que todavía no se le pagaron, del más viejo al más nuevo. */
export const turnosSinPagar = (fichadas: Fichada[], empleadoId: string, gastos: Gasto[]) =>
  fichadas
    .filter(f => f.empleado_id === empleadoId && f.salida && !estaPagada(f, gastos))
    .sort((a, b) => a.entrada.localeCompare(b.entrada));

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** Hasta cuánto para atrás se puede poner la hora a mano al marcar. Más viejo, se corrige el turno. */
const atrasMaximo = 24 * 60 * minuto;

const validarHoraManual = (marcada: Date, ahora: Date) => {
  if (Number.isNaN(marcada.getTime())) throw new Error('Revisá la hora.');
  if (marcada.getTime() > ahora.getTime() + minuto) throw new Error('La hora no puede ser más adelante que ahora.');
  if (ahora.getTime() - marcada.getTime() > atrasMaximo) throw new Error('Esa hora es de hace más de un día: corregí el turno desde la lista.');
};

/**
 * Marca la entrada. Con `marcada` se pone la hora a mano (llegó antes y se le pasó marcar);
 * sin ella, es ahora.
 */
export const marcarEntrada = (usuario: Profile, actor?: string, ahora = new Date(), marcada?: Date): Fichada => {
  const fichadas = loadFichadas();
  const abierto = turnoAbierto(fichadas, usuario.id);
  if (abierto) throw new Error(`${usuario.nombre} ya está trabajando desde las ${hora(abierto.entrada)}.`);
  if (marcada) validarHoraManual(marcada, ahora);
  const entrada = marcada || ahora;
  const pisa = fichadas.find(f => f.empleado_id === usuario.id && f.salida && new Date(f.salida).getTime() > entrada.getTime());
  if (pisa) throw new Error(`Esa hora pisa su turno anterior, que terminó a las ${hora(pisa.salida as string)}.`);
  const iso = ahora.toISOString();
  const nueva: Fichada = {
    id: nuevoId('fichada'),
    empleado_id: usuario.id,
    entrada: entrada.toISOString(),
    valor_hora: usuario.valor_hora && usuario.valor_hora > 0 ? usuario.valor_hora : undefined,
    entrada_por: actor,
    ...(marcada ? { entrada_manual: true } : {}),
    created_at: iso,
    updated_at: iso,
  };
  saveFichadas([nueva, ...fichadas]);
  return nueva;
};

/** Marca la salida. Con `marcada` se pone la hora a mano (se fue antes y se le pasó marcar). */
export const marcarSalida = (usuario: Profile, actor?: string, ahora = new Date(), marcada?: Date): Fichada => {
  const fichadas = loadFichadas();
  const abierto = turnoAbierto(fichadas, usuario.id);
  if (!abierto) throw new Error(`${usuario.nombre} no tiene marcada la entrada.`);
  if (marcada) validarHoraManual(marcada, ahora);
  const salida = marcada || ahora;
  if (salida.getTime() <= new Date(abierto.entrada).getTime()) {
    throw new Error(`La salida tiene que ser después de la entrada (${hora(abierto.entrada)}).`);
  }
  const iso = ahora.toISOString();
  const cerrado: Fichada = {
    ...abierto,
    salida: salida.toISOString(),
    salida_por: actor,
    ...(marcada ? { salida_manual: true } : {}),
    updated_at: iso,
  };
  saveFichadas(fichadas.map(f => (f.id === abierto.id ? cerrado : f)));
  return cerrado;
};

export interface CorreccionFichada {
  entrada: string;
  /** Vacío: sigue trabajando. */
  salida?: string;
  valor_hora?: number;
}

/** Para cuando se olvidaron de marcar o marcaron tarde. Lo ya pagado no se toca. */
export const corregirFichada = (id: string, cambios: CorreccionFichada, actor?: string, ahora = new Date()): Fichada => {
  const fichadas = loadFichadas();
  const actual = fichadas.find(f => f.id === id);
  if (!actual) throw new Error('Ese turno ya no está.');
  if (estaPagada(actual, loadGastos())) throw new Error('Ese turno ya se pagó: no se puede cambiar.');
  const entrada = new Date(cambios.entrada);
  const salida = cambios.salida ? new Date(cambios.salida) : null;
  if (Number.isNaN(entrada.getTime())) throw new Error('Revisá la hora de entrada.');
  if (salida && Number.isNaN(salida.getTime())) throw new Error('Revisá la hora de salida.');
  if (entrada.getTime() > ahora.getTime() + minuto) throw new Error('La entrada no puede ser más adelante que ahora.');
  if (salida && salida.getTime() > ahora.getTime() + minuto) throw new Error('La salida no puede ser más adelante que ahora.');
  if (salida && salida.getTime() <= entrada.getTime()) throw new Error('La salida tiene que ser después de la entrada.');
  if (!salida && fichadas.some(f => f.id !== id && f.empleado_id === actual.empleado_id && !f.salida)) {
    throw new Error('Ya tiene otro turno abierto: poné la hora de salida.');
  }
  const pisa = fichadas.some(f => {
    if (f.id === id || f.empleado_id !== actual.empleado_id) return false;
    const otroInicio = new Date(f.entrada).getTime();
    const otroFin = f.salida ? new Date(f.salida).getTime() : ahora.getTime();
    const fin = salida ? salida.getTime() : ahora.getTime();
    return entrada.getTime() < otroFin && otroInicio < fin;
  });
  if (pisa) throw new Error('Ese horario se superpone con otro turno de la misma persona.');
  if (cambios.valor_hora !== undefined && (!Number.isFinite(cambios.valor_hora) || cambios.valor_hora < 0)) {
    throw new Error('Revisá el valor de la hora.');
  }
  const iso = ahora.toISOString();
  const corregida: Fichada = {
    ...actual,
    entrada: entrada.toISOString(),
    salida: salida ? salida.toISOString() : undefined,
    valor_hora: cambios.valor_hora !== undefined ? (cambios.valor_hora > 0 ? cambios.valor_hora : undefined) : actual.valor_hora,
    corregido_por: actor,
    corregido_at: iso,
    updated_at: iso,
  };
  if (!corregida.salida) delete corregida.salida;
  saveFichadas(fichadas.map(f => (f.id === id ? corregida : f)));
  return corregida;
};

export const borrarFichada = (id: string) => {
  const fichadas = loadFichadas();
  const actual = fichadas.find(f => f.id === id);
  if (!actual) return;
  if (estaPagada(actual, loadGastos())) throw new Error('Ese turno ya se pagó: para sacarlo, borrá primero el pago en Gastos → Pagos.');
  saveFichadas(fichadas.filter(f => f.id !== id));
};

/** De dónde sale la plata, igual que en Pagos. */
export type MedioPagoHoras = 'caja_dia' | 'caja_grande' | 'transferencia';

export interface DatosPagoHoras {
  usuario: Profile;
  fichadaIds: string[];
  monto: number;
  medio: MedioPagoHoras;
  /** Para transferencia: de qué cuenta sale. Por defecto, el banco. */
  cuenta_id?: string;
  creado_por?: string;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

/**
 * Paga las horas: deja el gasto de sueldo (se ve en Pagos y en su estado de cuenta), saca la plata
 * de donde se eligió y marca los turnos como pagados. Desde la caja del día, el gasto va a la caja
 * que está abierta ahora: si entró con la caja de la mañana y se va a la noche, lo descuenta la de la noche.
 */
export const pagarHoras = (datos: DatosPagoHoras): Gasto => withStoreTransaction(() => {
  const gastos = loadGastos();
  const fichadas = loadFichadas();
  const elegidas = datos.fichadaIds.map(id => fichadas.find(f => f.id === id));
  if (!elegidas.length) throw new Error('Elegí qué turnos le pagás.');
  if (elegidas.some(f => !f || f.empleado_id !== datos.usuario.id)) throw new Error('Algún turno ya no está. Volvé a abrir el pago.');
  const turnos = elegidas as Fichada[];
  if (turnos.some(f => !f.salida)) throw new Error('Marcá la salida antes de pagar ese turno.');
  if (turnos.some(f => estaPagada(f, gastos))) throw new Error('Algún turno ya se pagó. Volvé a abrir el pago.');

  const caja = datos.medio === 'caja_dia' ? cajaAbiertaActual(loadCajasDiarias()) : null;
  if (datos.medio === 'caja_dia' && !caja) throw new Error('La caja del día está cerrada. Abrí la caja o pagá desde la caja grande.');
  const fecha = caja ? caja.fecha : dayKey();
  const minutos = turnos.reduce((suma, f) => suma + minutosDe(f), 0);
  const ordenados = [...turnos].sort((a, b) => a.entrada.localeCompare(b.entrada));
  const desde = fechaCorta(ordenados[0].entrada);
  const hasta = fechaCorta(ordenados[ordenados.length - 1].salida as string);
  const detalle = ordenados
    .map(f => `${fechaCorta(f.entrada)} ${hora(f.entrada)} a ${hora(f.salida as string)} (${textoHoras(minutosDe(f))} x $${valorHoraDe(f, datos.usuario).toLocaleString('es-AR')})`)
    .join(' · ');

  const gasto = pagarSueldo({
    usuario: datos.usuario,
    periodo: fecha.slice(0, 7),
    concepto: `Horas ${nombreUsuario(datos.usuario)} · ${textoHoras(minutos)} (${desde === hasta ? desde : `${desde} al ${hasta}`})`,
    monto: datos.monto,
    fecha,
    metodo_pago: datos.medio === 'transferencia' ? 'transferencia' : 'efectivo',
    cuenta_id: datos.medio === 'caja_grande' ? cuentaCajaGrandeId : datos.cuenta_id || cuentaBancoId,
    desde_caja_dia: datos.medio === 'caja_dia',
    cuenta_caja_dia_id: cuentaCajaDiaId,
    observaciones: detalle,
    creado_por: datos.creado_por,
  });

  const ahora = new Date().toISOString();
  const ids = new Set(turnos.map(f => f.id));
  saveFichadas(loadFichadas().map(f => (ids.has(f.id) ? { ...f, gasto_id: gasto.id, pagado_at: ahora, updated_at: ahora } : f)));
  return gasto;
});
