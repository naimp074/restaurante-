import { dominioCuentas } from './cuentaUsuario';

/** Si falta más que esto (efectivo y transferencia, sin restar lo que sobra), se avisa. */
export const UMBRAL_FALTA_CAJA = 5000;

export type ConteoCierre = {
  fecha: string;
  cajero: string;
  esperadoEfectivo: number;
  contadoEfectivo: number;
  esperadoTransferencia: number;
  contadoTransferencia: number;
};

export type AvisoCierreCaja = {
  /** falta: hay que decir que falta plata. cierre: solo que se cerró, sin importes. */
  tipo: 'falta' | 'cierre';
  asunto: string;
  texto: string;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

const pesos = (n: number) => {
  const negativo = n < 0;
  const [entero, dec] = Math.abs(n).toFixed(2).split('.');
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}$${conPuntos},${dec}`;
};

const fechaLegible = (fecha: string) => {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
};

const faltaDe = (esperado: number, contado: number) => {
  const falta = redondear(esperado - contado);
  return falta > 0 ? falta : 0;
};

/**
 * Arma el mail del cierre.
 * Falta más de $5.000: avisa que falta plata y no nombra los medios en los que sobró.
 * Si sobra y la falta no pasa el umbral: solo dice que se cerró la caja, sin importes.
 * Si cuadra, o la falta es de $5.000 o menos y no sobra nada, no hay mail.
 */
export const armarAvisoCierre = (conteo: ConteoCierre): AvisoCierreCaja | null => {
  const medios = [
    { nombre: 'Efectivo', esperado: conteo.esperadoEfectivo, contado: conteo.contadoEfectivo },
    { nombre: 'Transferencia', esperado: conteo.esperadoTransferencia, contado: conteo.contadoTransferencia },
  ];
  const faltas = medios
    .map(medio => ({ ...medio, falta: faltaDe(medio.esperado, medio.contado) }))
    .filter(medio => medio.falta > 0);
  const totalFalta = redondear(faltas.reduce((suma, medio) => suma + medio.falta, 0));
  const haySobra = medios.some(medio => redondear(medio.contado - medio.esperado) > 0);
  const fecha = fechaLegible(conteo.fecha);
  const cajero = conteo.cajero.trim() || 'Cajero';

  if (totalFalta > UMBRAL_FALTA_CAJA) {
    const lineas = faltas.map(medio =>
      `${medio.nombre}: se esperaban ${pesos(medio.esperado)} y se contaron ${pesos(medio.contado)}. Faltan ${pesos(medio.falta)}.`);
    return {
      tipo: 'falta',
      asunto: 'Falta plata en el cierre de caja',
      texto: [
        `En el cierre de caja del ${fecha} está faltando plata.`,
        `Cajero: ${cajero}.`,
        ...lineas,
        `Total que falta: ${pesos(totalFalta)}.`,
      ].join('\n'),
    };
  }

  if (haySobra) {
    return {
      tipo: 'cierre',
      asunto: 'Cierre de caja',
      texto: `Se hizo el cierre de caja del ${fecha}.\nCajero: ${cajero}.`,
    };
  }

  return null;
};

/** Deja solo correos reales. Las cuentas internas (usuario sin email) no reciben avisos. */
export const correoReal = (email: string) => {
  const limpio = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return '';
  if (limpio.endsWith(`@${dominioCuentas}`)) return '';
  return limpio;
};

export const destinatariosAviso = (correos: string[]) =>
  [...new Set(correos.map(correoReal).filter((correo): correo is string => Boolean(correo)))];
