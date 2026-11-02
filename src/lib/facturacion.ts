import { supabase } from './supabase';

export type CondicionEmisor = 'monotributo' | 'responsable_inscripto';

export type ConfigFacturacion = {
  cuit: string;
  razon_social: string;
  domicilio: string;
  ingresos_brutos: string;
  inicio_actividades: string | null;
  condicion_emisor: CondicionEmisor;
  punto_venta: number;
  alicuota: number;
  concepto: number;
  umbral_identificacion: number;
  activo: boolean;
};

export type EstadoComprobante = 'pendiente' | 'autorizado' | 'rechazado' | 'descartado';

export type ComprobanteFiscal = {
  id: string;
  pago_id: string;
  clase: 'factura' | 'nota_credito';
  asociado_id: string | null;
  ambiente: 'homologacion' | 'produccion';
  estado: EstadoComprobante;
  emisor: Pick<ConfigFacturacion, 'cuit' | 'razon_social' | 'domicilio' | 'ingresos_brutos' | 'inicio_actividades' | 'condicion_emisor'>;
  cbte_tipo: number;
  punto_venta: number;
  numero: number | null;
  fecha: string | null;
  doc_tipo: number;
  doc_nro: string;
  condicion_iva_receptor: number;
  receptor_nombre: string;
  total: number;
  neto: number;
  iva: number;
  alicuota: number;
  cae: string | null;
  cae_vencimiento: string | null;
  qr_url: string | null;
  error: string | null;
  created_at: string;
};

export type ReceptorFactura = { nombre: string; condicion_iva: number; doc_tipo: number; doc_nro: string };

export const condicionesIva = [
  { id: 5, label: 'Consumidor final' },
  { id: 1, label: 'Responsable inscripto' },
  { id: 6, label: 'Monotributista' },
  { id: 13, label: 'Monotributista social' },
  { id: 16, label: 'Monotributo trabajador independiente promovido' },
  { id: 4, label: 'Exento' },
];

const condicionDesdeTexto = (texto: string) => {
  const t = texto.toLowerCase();
  if (t.includes('inscripto')) return 1;
  if (t.includes('monotribut')) return 6;
  if (t.includes('exento')) return 4;
  return 5;
};

/** Según los dígitos: 11 es CUIT, menos es DNI y vacío, sin identificar. */
export const armarReceptor = (nombre: string, condicion_iva: number, documento: string): ReceptorFactura => {
  const doc_nro = documento.replace(/\D/g, '');
  const doc_tipo = doc_nro.length === 11 ? 80 : doc_nro ? 96 : 99;
  return { nombre: nombre.trim() || 'Consumidor final', condicion_iva, doc_tipo, doc_nro: doc_nro || '0' };
};

export const receptorDesdeCliente = (cliente: { nombre: string; condicion_iva: string; numero_documento: string } | null, nombre = '') =>
  cliente
    ? armarReceptor(cliente.nombre, condicionDesdeTexto(cliente.condicion_iva), cliente.numero_documento)
    : armarReceptor(nombre, 5, '');

const nombresCbte: Record<number, string> = {
  1: 'Factura A', 6: 'Factura B', 11: 'Factura C',
  3: 'Nota de crédito A', 8: 'Nota de crédito B', 13: 'Nota de crédito C',
};
export const nombreComprobante = (c: Pick<ComprobanteFiscal, 'cbte_tipo'>) => nombresCbte[c.cbte_tipo] || `Comprobante ${c.cbte_tipo}`;

export const numeroComprobante = (c: Pick<ComprobanteFiscal, 'punto_venta' | 'numero'>) =>
  `${String(c.punto_venta).padStart(5, '0')}-${String(c.numero ?? 0).padStart(8, '0')}`;

export const cargarConfigFacturacion = async (): Promise<ConfigFacturacion | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('arca_config').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConfigFacturacion | null;
};

export const guardarConfigFacturacion = async (localId: string, config: ConfigFacturacion) => {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  const { error } = await supabase.from('arca_config').upsert({ ...config, local_id: localId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
};

export const listarComprobantes = async (limite = 200): Promise<ComprobanteFiscal[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('comprobantes_fiscales').select('*').order('created_at', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return data as ComprobanteFiscal[];
};

const llamar = async (ruta: string, cuerpo: Record<string, unknown>): Promise<ComprobanteFiscal> => {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  const { data, error } = await supabase.functions.invoke(`arca/${ruta}`, { body: cuerpo });
  if (error) {
    // La función explica el problema en el cuerpo de la respuesta.
    const respuesta = (error as { context?: Response }).context;
    const detalle = await respuesta?.json?.().catch(() => null) as { error?: string } | null;
    throw new Error(detalle?.error || 'No pude comunicarme con la función de facturación.');
  }
  return (data as { comprobante: ComprobanteFiscal }).comprobante;
};

export const emitirFactura = (pagoId: string, total: number, receptor: ReceptorFactura) =>
  llamar('emitir', { pago_id: pagoId, total, receptor });
export const reintentarComprobante = (id: string) => llamar('reintentar', { id });
export const emitirNotaCredito = (id: string) => llamar('nota-credito', { id });
export const descartarComprobante = (id: string) => llamar('descartar', { id });
