import type { Pago } from './types';
import { nombreMedio } from './cobroComanda';
import { etiquetaPedido } from './pedidosCanal';
import { readStore } from './storeSync';
import { abrirVentanaTicket } from './ticketFiscal';

const escapar = (texto: unknown) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dinero = (n: number) => `$${Number(n).toLocaleString('es-AR')}`;

/** Reimprime el ticket de un cobro. No es factura: no tiene CAE. */
export const imprimirTicketCobro = (pago: Pago): boolean => {
  if (!pago.pedido) return false;
  const ventana = abrirVentanaTicket();
  if (!ventana) return false;

  const fecha = new Date(pago.created_at);
  const local = readStore<{ nombre?: string }>('restaurant-config-local', {});
  const items = (pago.pedido.items || []).filter(item => item.estado !== 'cancelado');
  const cuerpo = `
    <div class="center">
      <p class="title">${escapar(local.nombre || 'Restaurante')}</p>
      <p class="aviso">NO VÁLIDO COMO FACTURA</p>
    </div>
    <div class="line"></div>
    <div class="row"><span>${escapar(etiquetaPedido(pago.pedido))}</span><span>${escapar(fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span></div>
    <div class="row"><span>Comprador</span><span>${escapar(pago.comprador_nombre || 'Consumidor final')}</span></div>
    <div class="row"><span>Método</span><span>${escapar(nombreMedio(pago.metodo_pago))}</span></div>
    <div class="line"></div>
    ${items.map(item => `<div class="row"><span>${escapar(`${item.cantidad}x ${item.producto?.nombre || 'Producto'}`)}</span><span>${dinero(item.subtotal)}</span></div>`).join('')}
    ${pago.descuento_aplicado > 0 ? `<div class="row"><span>Descuento</span><span>-${dinero(pago.descuento_aplicado)}</span></div>` : ''}
    ${pago.recargo_aplicado > 0 ? `<div class="row"><span>Recargo</span><span>${dinero(pago.recargo_aplicado)}</span></div>` : ''}
    <div class="grand-total">Total: ${dinero(pago.total_cobrado)}</div>
    <div class="line"></div>
    <div class="center muted">Gracias por su visita</div>
  `;

  ventana.document.open();
  ventana.document.write(`<!doctype html><html><head><title>Ticket ${escapar(etiquetaPedido(pago.pedido))}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; font-family: Arial, sans-serif; color: #111827; }
      .ticket { width: 300px; margin: 0 auto; }
      .center { text-align: center; }
      .title { font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; }
      .aviso { font-size: 11px; font-weight: 800; margin-top: 6px; }
      .muted { font-size: 11px; color: #64748b; }
      .line { border-top: 1px dashed #94a3b8; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
      .grand-total { font-size: 18px; font-weight: 900; margin-top: 8px; text-align: center; }
      @media print { body { padding: 0; } .ticket { width: 72mm; } }
    </style></head><body><div class="ticket">${cuerpo}</div>
    <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
    </body></html>`);
  ventana.document.close();
  return true;
};
