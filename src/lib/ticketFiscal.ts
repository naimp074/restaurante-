import QRCode from 'qrcode';
import type { ComprobanteFiscal } from './facturacion';
import { condicionesIva, nombreComprobante, numeroComprobante } from './facturacion';

export type LineaTicket = { nombre: string; subtotal: number };

const escapar = (texto: unknown) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dinero = (n: number) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaDe = (aaaammdd?: string | null) =>
  aaaammdd ? `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}` : '-';

const documento = (c: ComprobanteFiscal) => {
  if (c.doc_tipo === 99) return '';
  return `${c.doc_tipo === 80 ? 'CUIT' : c.doc_tipo === 86 ? 'CUIL' : 'DNI'} ${c.doc_nro}`;
};

const estilos = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; font-family: Arial, sans-serif; color: #111827; }
  .ticket { width: 300px; margin: 0 auto; }
  .center { text-align: center; }
  .title { font-size: 16px; font-weight: 800; margin: 0; }
  .letra { font-size: 18px; font-weight: 900; margin: 8px 0 0; }
  .aviso { font-size: 12px; font-weight: 800; border: 1px solid #111827; padding: 4px; margin-top: 8px; }
  .muted { font-size: 11px; color: #334155; margin: 2px 0; }
  .line { border-top: 1px dashed #94a3b8; margin: 10px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
  .grand-total { font-size: 18px; font-weight: 900; margin-top: 8px; text-align: center; }
  img { width: 130px; height: 130px; display: block; margin: 8px auto 0; }
  @media print { body { padding: 0; } .ticket { width: 72mm; } }
`;

/**
 * Se abre al tocar el botón: si se abre después de esperar a ARCA, el navegador la bloquea
 * por considerarla una ventana emergente.
 */
export const abrirVentanaTicket = () => {
  const ventana = window.open('', '_blank', 'width=380,height=650');
  ventana?.document.write('<p style="font-family:Arial;padding:16px">Preparando el comprobante…</p>');
  return ventana;
};

const escribir = (ventana: Window, titulo: string, cuerpo: string) => {
  ventana.document.open();
  ventana.document.write(`<!doctype html><html><head><title>${escapar(titulo)}</title><style>${estilos}</style></head><body><div class="ticket">${cuerpo}</div>
    <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script></body></html>`);
  ventana.document.close();
};

export const imprimirComprobanteFiscal = async (ventana: Window, c: ComprobanteFiscal, lineas: LineaTicket[] = []) => {
  const qr = c.qr_url ? await QRCode.toDataURL(c.qr_url, { margin: 1, width: 260 }) : '';
  const nombre = nombreComprobante(c);
  const esNota = c.clase === 'nota_credito';
  const esA = [1, 3].includes(c.cbte_tipo);
  const esB = [6, 8].includes(c.cbte_tipo);
  const condicion = condicionesIva.find(i => i.id === c.condicion_iva_receptor)?.label || '';
  const emisor = c.emisor;

  escribir(ventana, `${nombre} ${numeroComprobante(c)}`, `
    <div class="center">
      <p class="title">${escapar(emisor.razon_social)}</p>
      <p class="muted">${escapar(emisor.domicilio)}</p>
      <p class="muted">CUIT ${escapar(emisor.cuit)} · ${emisor.condicion_emisor === 'monotributo' ? 'Responsable Monotributo' : 'IVA Responsable Inscripto'}</p>
      ${emisor.ingresos_brutos ? `<p class="muted">IIBB ${escapar(emisor.ingresos_brutos)}</p>` : ''}
      ${emisor.inicio_actividades ? `<p class="muted">Inicio de actividades ${escapar(emisor.inicio_actividades.split('-').reverse().join('/'))}</p>` : ''}
      <p class="letra">${escapar(nombre)}</p>
      <p class="muted">N° ${numeroComprobante(c)} · ${fechaDe(c.fecha)}</p>
      ${c.ambiente === 'homologacion' ? '<p class="aviso">PRUEBA: SIN VALIDEZ FISCAL</p>' : ''}
    </div>
    <div class="line"></div>
    <div class="row"><span>${c.condicion_iva_receptor === 5 ? 'A CONSUMIDOR FINAL' : escapar(c.receptor_nombre)}</span></div>
    ${documento(c) ? `<div class="row"><span>${escapar(documento(c))}</span></div>` : ''}
    ${c.condicion_iva_receptor !== 5 ? `<div class="row"><span>${escapar(condicion)}</span></div>` : ''}
    ${lineas.length ? `<div class="line"></div>${lineas.map(l => `<div class="row"><span>${escapar(l.nombre)}</span><span>${dinero(l.subtotal)}</span></div>`).join('')}` : ''}
    <div class="line"></div>
    ${esA ? `<div class="row"><span>Neto gravado</span><span>${dinero(c.neto)}</span></div><div class="row"><span>IVA ${c.alicuota}%</span><span>${dinero(c.iva)}</span></div>` : ''}
    <div class="grand-total">Total: ${dinero(c.total)}</div>
    ${esB ? `<div class="line"></div><p class="muted">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p><div class="row"><span>IVA Contenido</span><span>${dinero(c.iva)}</span></div><div class="row"><span>Otros Impuestos Nacionales Indirectos</span><span>${dinero(0)}</span></div>` : ''}
    ${esNota ? '<p class="muted center">Anula la factura asociada</p>' : ''}
    <div class="line"></div>
    <div class="row"><span>CAE</span><span>${escapar(c.cae)}</span></div>
    <div class="row"><span>Vencimiento CAE</span><span>${fechaDe(c.cae_vencimiento)}</span></div>
    ${qr ? `<img src="${qr}" alt="QR">` : ''}
  `);
};
