import type { Pedido, Producto } from './types';
import { etiquetaPedido } from './pedidosCanal';
import { detalleTicket } from './opcionesProducto';
import { estiloSeccionTicket, htmlItemsPorSeccion } from './seccionesTicket';

const escapar = (texto: unknown) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dinero = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;

/**
 * La cuenta de lo consumido hasta ahora, para que el cliente la vea antes de pagar.
 * No cobra ni cierra nada: la mesa sigue abierta y se puede seguir agregando.
 */
export const htmlCuentaMesa = (pedido: Pedido, nombreLocal: string, catalogo: Producto[] = [], ahora = new Date()) => {
  const items = (pedido.items || []).filter(item => item.estado !== 'cancelado');
  const renglon = (item: (typeof items)[number]) => {
    const detalle = detalleTicket(item.opciones, item.observaciones);
    return `<div class="row"><span class="item-name">${item.cantidad}x ${escapar(item.producto?.nombre || 'Producto')}</span><span>${dinero(item.subtotal)}</span></div>${detalle ? `<div class="muted detalle">${detalle}</div>` : ''}`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cuenta ${escapar(etiquetaPedido(pedido))}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; font-family: Arial, sans-serif; color: #111827; }
      .ticket { width: 300px; margin: 0 auto; }
      .center { text-align: center; }
      .title { font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; }
      .aviso { font-size: 11px; font-weight: 800; margin-top: 6px; }
      .muted { font-size: 11px; color: #64748b; }
      .detalle { margin: -2px 0 4px 12px; }
      .line { border-top: 1px dashed #94a3b8; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
      .item-name { max-width: 190px; }
      .grand-total { font-size: 18px; font-weight: 900; margin-top: 8px; text-align: center; }
      ${estiloSeccionTicket}
      @media print { body { padding: 0; } .ticket { width: 72mm; } }
    </style></head><body><div class="ticket">
      <div class="center">
        <p class="title">${escapar(nombreLocal || 'Aroma')}</p>
        <p class="aviso">CUENTA · NO VÁLIDO COMO FACTURA</p>
      </div>
      <div class="line"></div>
      <div class="row"><span>${escapar(etiquetaPedido(pedido))}</span><span>${ahora.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
      ${pedido.empleado?.nombre ? `<div class="row"><span>Moza/o</span><span>${escapar(pedido.empleado.nombre)}</span></div>` : ''}
      ${pedido.cantidad_personas ? `<div class="row"><span>Personas</span><span>${pedido.cantidad_personas}</span></div>` : ''}
      <div class="line"></div>
      ${htmlItemsPorSeccion(items, renglon, catalogo)}
      <div class="line"></div>
      ${pedido.descuento > 0 || pedido.recargo > 0 ? `<div class="row"><span>Subtotal</span><span>${dinero(pedido.subtotal)}</span></div>` : ''}
      ${pedido.descuento > 0 ? `<div class="row"><span>Descuento</span><span>-${dinero(pedido.descuento)}</span></div>` : ''}
      ${pedido.recargo > 0 ? `<div class="row"><span>Recargo</span><span>${dinero(pedido.recargo)}</span></div>` : ''}
      <div class="grand-total">Total: ${dinero(pedido.total)}</div>
      <div class="line"></div>
      <div class="center muted">Gracias por su visita</div>
    </div>
    <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
    </body></html>`;
};

/** Abre la cuenta para imprimir. Devuelve false si el navegador bloqueó la ventana. */
export const imprimirCuentaMesa = (pedido: Pedido, nombreLocal: string, catalogo: Producto[] = []): boolean => {
  const ventana = window.open('', '_blank', 'width=380,height=650');
  if (!ventana) return false;
  ventana.document.open();
  ventana.document.write(htmlCuentaMesa(pedido, nombreLocal, catalogo));
  ventana.document.close();
  return true;
};
