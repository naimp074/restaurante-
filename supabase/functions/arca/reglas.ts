/** Reglas fiscales sin conexión: qué comprobante corresponde, importes y QR. */

export type CondicionEmisor = 'monotributo' | 'responsable_inscripto';
export type Clase = 'factura' | 'nota_credito';

// Códigos de ARCA: FEParamGetCondicionIvaReceptor y FEParamGetTiposDoc.
export const condicionIva = { inscripto: 1, exento: 4, consumidorFinal: 5, monotributo: 6, monotributoSocial: 13, monotributoPromovido: 16 };
export const tipoDoc = { cuit: 80, cuil: 86, dni: 96, sinIdentificar: 99 };

const recibenFacturaA = [condicionIva.inscripto, condicionIva.monotributo, condicionIva.monotributoSocial, condicionIva.monotributoPromovido];
const condicionesValidas = [...recibenFacturaA, condicionIva.exento, condicionIva.consumidorFinal];

const tipos = {
  A: { factura: 1, nota_credito: 3 },
  B: { factura: 6, nota_credito: 8 },
  C: { factura: 11, nota_credito: 13 },
};

const idAlicuota: Record<string, number> = { '0': 3, '2.5': 9, '5': 8, '10.5': 4, '21': 5, '27': 6 };

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const letraSegun = (emisor: CondicionEmisor, condicionReceptor: number): keyof typeof tipos => {
  if (emisor === 'monotributo') return 'C';
  return recibenFacturaA.includes(condicionReceptor) ? 'A' : 'B';
};

export const tipoComprobante = (emisor: CondicionEmisor, condicionReceptor: number, clase: Clase) =>
  tipos[letraSegun(emisor, condicionReceptor)][clase];

/** La nota de crédito lleva la misma letra que la factura que anula. */
export const notaCreditoDe = (cbteTipoFactura: number) => {
  const letra = Object.values(tipos).find(t => t.factura === cbteTipoFactura);
  if (!letra) throw new Error(`No sé anular el comprobante tipo ${cbteTipoFactura}.`);
  return letra.nota_credito;
};

/** El IVA va incluido en el total. Monotributo no lo discrimina. Neto + IVA siempre da el total exacto. */
export const calcularImportes = (total: number, emisor: CondicionEmisor, alicuota: number) => {
  if (emisor === 'monotributo') return { neto: redondear(total), iva: 0, alicuota: 0 };
  const neto = redondear(total / (1 + alicuota / 100));
  return { neto, iva: redondear(total - neto), alicuota };
};

export const idDeAlicuota = (alicuota: number) => {
  const id = idAlicuota[String(alicuota)];
  if (!id) throw new Error(`Alícuota de IVA desconocida: ${alicuota}.`);
  return id;
};

export const cuitValido = (cuit: string) => {
  if (!/^\d{11}$/.test(cuit)) return false;
  const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, peso, i) => s + peso * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(cuit[10]);
};

export type Receptor = { nombre?: string; condicion_iva: number; doc_tipo: number; doc_nro: string };

/** Devuelve el problema a mostrarle al cajero, o null si se puede facturar. */
export const problemaDelReceptor = (receptor: Receptor, emisor: CondicionEmisor, total: number, umbral: number): string | null => {
  if (!condicionesValidas.includes(receptor.condicion_iva)) return 'Elegí la condición de IVA del cliente.';
  const doc = receptor.doc_nro.replace(/\D/g, '');
  if ([tipoDoc.cuit, tipoDoc.cuil].includes(receptor.doc_tipo) && !cuitValido(doc)) return 'El CUIT o CUIL no es válido.';
  if (receptor.doc_tipo === tipoDoc.dni && !/^\d{7,8}$/.test(doc)) return 'El DNI no es válido.';
  if (![tipoDoc.cuit, tipoDoc.cuil, tipoDoc.dni, tipoDoc.sinIdentificar].includes(receptor.doc_tipo)) return 'Tipo de documento desconocido.';
  if (letraSegun(emisor, receptor.condicion_iva) === 'A' && receptor.doc_tipo !== tipoDoc.cuit) return 'Para Factura A hace falta el CUIT del cliente.';
  if (receptor.condicion_iva !== condicionIva.consumidorFinal && receptor.doc_tipo === tipoDoc.sinIdentificar) return 'Para esa condición de IVA hace falta el documento del cliente.';
  if (total >= umbral && receptor.doc_tipo === tipoDoc.sinIdentificar) return `Desde $${umbral.toLocaleString('es-AR')} hay que identificar al cliente con su documento.`;
  return null;
};

/** Fecha de hoy en Argentina como la pide ARCA: AAAAMMDD. */
export const fechaArgentina = (ahora = new Date()) =>
  new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');

const base64 = (texto: string) => btoa(String.fromCharCode(...new TextEncoder().encode(texto)));

/** QR obligatorio (RG 4892). */
export const urlQr = (d: {
  fecha: string; cuit: string; punto_venta: number; cbte_tipo: number; numero: number;
  total: number; doc_tipo: number; doc_nro: string; cae: string;
}) => {
  const datos = {
    ver: 1,
    fecha: `${d.fecha.slice(0, 4)}-${d.fecha.slice(4, 6)}-${d.fecha.slice(6, 8)}`,
    cuit: Number(d.cuit),
    ptoVta: d.punto_venta,
    tipoCmp: d.cbte_tipo,
    nroCmp: d.numero,
    importe: d.total,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: d.doc_tipo,
    nroDocRec: Number(d.doc_nro),
    tipoCodAut: 'E',
    codAut: Number(d.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${base64(JSON.stringify(datos))}`;
};
