import { useEffect, useState } from 'react';
import type { Pedido, PedidoItem, Producto } from './types';
import { itemsParaCocina } from './cobroComanda';
import { canalDe, etiquetaPedido } from './pedidosCanal';
import { escaparHtml, textoOpciones } from './opcionesProducto';
import { estiloSeccionTicket, htmlItemsPorSeccion } from './seccionesTicket';

/**
 * Estas claves son de cada compu: no viajan a Supabase (no están en documentosSync).
 * Así solo imprime la compu de la cocina, no todas las que tienen el sistema abierto.
 */
export const claveImpresionAuto = 'restaurant-cocina-impresion-auto';
export const claveComandasImpresas = 'restaurant-cocina-comandas-impresas';
export const eventoImpresionAuto = 'restaurant-cocina-impresion-auto-updated';

/** Por ítem: cuándo salió en una comanda y si ya se imprimió su anulación. */
export type RegistroImpresas = Record<string, { at: string; anulado?: boolean }>;

const leer = <T,>(clave: string, porDefecto: T): T => {
  try {
    const guardado = window.localStorage.getItem(clave);
    return guardado ? JSON.parse(guardado) as T : porDefecto;
  } catch {
    return porDefecto;
  }
};

export const impresionAutoActiva = () => leer<boolean>(claveImpresionAuto, false) === true;

/** Si esta compu tiene activada la impresión automática; se entera si la cambian en otra pestaña. */
export const useImpresionAuto = () => {
  const [activa, setActiva] = useState(impresionAutoActiva);
  useEffect(() => {
    const actualizar = () => setActiva(impresionAutoActiva());
    const porStorage = (e: StorageEvent) => { if (e.key === claveImpresionAuto) actualizar(); };
    window.addEventListener(eventoImpresionAuto, actualizar);
    window.addEventListener('storage', porStorage);
    return () => {
      window.removeEventListener(eventoImpresionAuto, actualizar);
      window.removeEventListener('storage', porStorage);
    };
  }, []);
  return activa;
};

export const cargarImpresas = (): RegistroImpresas => leer(claveComandasImpresas, {});

/** Guarda lo impreso y descarta lo de hace más de dos días para que no crezca sin fin. */
export const guardarImpresas = (registro: RegistroImpresas, ahora = new Date()) => {
  const limite = ahora.getTime() - 2 * 24 * 60 * 60 * 1000;
  const vigente = Object.fromEntries(Object.entries(registro).filter(([, r]) => new Date(r.at).getTime() >= limite));
  try { window.localStorage.setItem(claveComandasImpresas, JSON.stringify(vigente)); } catch { /* sin espacio: a lo sumo reimprime */ }
};

/** Lo que ya está en cocina queda como impreso: al activar no sale todo lo viejo de golpe. */
export const marcarTodoComoImpreso = (pedidos: Pedido[], registro: RegistroImpresas, ahora = new Date().toISOString()): RegistroImpresas => {
  const nuevo = { ...registro };
  pedidos.forEach(p => (p.items || []).forEach(item => {
    if (!nuevo[item.id]) nuevo[item.id] = { at: ahora, anulado: item.estado === 'cancelado' || undefined };
  }));
  return nuevo;
};

export const activarImpresionAuto = (activa: boolean, pedidos: Pedido[]) => {
  if (activa) guardarImpresas(marcarTodoComoImpreso(pedidos, cargarImpresas()));
  try { window.localStorage.setItem(claveImpresionAuto, JSON.stringify(activa)); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent(eventoImpresionAuto));
};

const comandaCerrada = (pedido: Pedido) =>
  pedido.estado === 'abierto' || pedido.estado === 'cobrado' || pedido.estado === 'cuenta_corriente' || pedido.estado === 'cancelado';

export type TipoComanda = 'nueva' | 'agregado' | 'anulacion' | 'reimpresion';

export interface ComandaAImprimir {
  pedido: Pedido;
  items: PedidoItem[];
  tipo: TipoComanda;
}

/**
 * Lo que falta imprimir: lo que la moza mandó a cocina y todavía no salió en papel,
 * y lo que se anuló después de haber salido.
 */
export const comandasPendientes = (pedidos: Pedido[], registro: RegistroImpresas): ComandaAImprimir[] => {
  const salida: ComandaAImprimir[] = [];
  pedidos.forEach(pedido => {
    if (pedido.estado === 'abierto') return;
    const todos = pedido.items || [];
    if (!comandaCerrada(pedido)) {
      const nuevos = itemsParaCocina(pedido).filter(item => item.estado === 'pendiente' && !registro[item.id]);
      if (nuevos.length) {
        const yaHabiaSalido = todos.some(item => registro[item.id] && !nuevos.includes(item));
        salida.push({ pedido, items: nuevos, tipo: yaHabiaSalido ? 'agregado' : 'nueva' });
      }
    }
    const anulados = todos.filter(item => item.estado === 'cancelado' && registro[item.id] && !registro[item.id].anulado);
    if (anulados.length) salida.push({ pedido, items: anulados, tipo: 'anulacion' });
  });
  return salida;
};

/** Anota en el registro lo que se acaba de imprimir. */
export const registrarImpresa = (registro: RegistroImpresas, comanda: ComandaAImprimir, ahora = new Date().toISOString()): RegistroImpresas => {
  const nuevo = { ...registro };
  comanda.items.forEach(item => {
    nuevo[item.id] = comanda.tipo === 'anulacion'
      ? { at: nuevo[item.id]?.at || ahora, anulado: true }
      : { at: ahora, anulado: nuevo[item.id]?.anulado };
  });
  return nuevo;
};

const titulos: Record<TipoComanda, string> = {
  nueva: 'COMANDA',
  agregado: 'AGREGADO',
  anulacion: '*** ANULADO ***',
  reimpresion: 'COMANDA (REIMPRESA)',
};

const quienLleva = (pedido: Pedido) => {
  if (canalDe(pedido) === 'salon') return pedido.empleado?.nombre ? `Moza/o: ${pedido.empleado.nombre}` : '';
  if (pedido.externo?.tipo_entrega === 'delivery_plataforma') return 'Lo retira PedidosYa';
  return pedido.direccion_entrega ? 'Delivery' : 'Retira en el local';
};

/** La comanda en papel: grande, sin precios, con las entradas separadas de los principales. */
export const htmlComanda = (comanda: ComandaAImprimir, catalogo: Producto[] = [], ahora = new Date()) => {
  const { pedido, items, tipo } = comanda;
  const renglon = (item: PedidoItem) => {
    const detalle = [textoOpciones(item.opciones), item.observaciones ? `* ${item.observaciones}` : ''].filter(Boolean).join(' · ');
    return `<div class="item${tipo === 'anulacion' ? ' tachado' : ''}"><span class="cant">${item.cantidad}x</span> ${escaparHtml(item.producto?.nombre || 'Producto')}</div>${detalle ? `<div class="detalle">${escaparHtml(detalle)}</div>` : ''}${tipo === 'anulacion' && item.motivo_anulacion ? `<div class="detalle">Motivo: ${escaparHtml(item.motivo_anulacion)}</div>` : ''}`;
  };
  const extra = quienLleva(pedido);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda ${escaparHtml(etiquetaPedido(pedido))}</title>
    <style>
      * { box-sizing: border-box; }
      @page { margin: 0; }
      body { margin: 0; padding: 8px; font-family: Arial, sans-serif; color: #000; }
      .comanda { width: 72mm; }
      .tipo { text-align: center; font-size: 16px; font-weight: 900; }
      .mesa { text-align: center; font-size: 26px; font-weight: 900; margin: 4px 0; }
      .row { display: flex; justify-content: space-between; font-size: 12px; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .item { font-size: 17px; font-weight: 700; margin: 5px 0 1px; }
      .cant { font-weight: 900; }
      .detalle { font-size: 13px; margin: 0 0 3px 14px; }
      .tachado { text-decoration: line-through; }
      .obs { font-size: 14px; font-weight: 700; margin-top: 6px; }
      ${estiloSeccionTicket}
    </style></head><body><div class="comanda">
      <div class="tipo">${titulos[tipo]}</div>
      <div class="mesa">${escaparHtml(etiquetaPedido(pedido))}</div>
      <div class="row"><span>${escaparHtml(extra)}</span><span>${ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      ${pedido.cantidad_personas ? `<div class="row"><span>Personas: ${pedido.cantidad_personas}</span><span>${ahora.toLocaleDateString('es-AR')}</span></div>` : ''}
      <div class="line"></div>
      ${htmlItemsPorSeccion(items, renglon, catalogo)}
      ${pedido.observaciones && tipo !== 'anulacion' ? `<div class="line"></div><div class="obs">* ${escaparHtml(pedido.observaciones)}</div>` : ''}
      <div class="line"></div>
    </div></body></html>`;
};

let cola: Promise<void> = Promise.resolve();

/**
 * Imprime en un iframe oculto, sin abrir ventanas (así no lo frena el bloqueador de ventanas emergentes).
 * Va de a una: si llegan dos comandas juntas, la segunda espera a que termine la primera.
 * Con Chrome o Edge abiertos con --kiosk-printing sale directo a la impresora predeterminada, sin preguntar.
 */
export const imprimirHtml = (html: string) => {
  cola = cola.then(() => new Promise<void>(resolve => {
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    let listo = false;
    const terminar = () => {
      if (listo) return;
      listo = true;
      setTimeout(() => { marco.remove(); resolve(); }, 500);
    };
    marco.onload = () => {
      const ventana = marco.contentWindow;
      if (!ventana) return terminar();
      ventana.onafterprint = terminar;
      ventana.focus();
      ventana.print();
      // Si el navegador no avisa cuando termina, no trabamos la cola.
      setTimeout(terminar, 15000);
    };
    marco.srcdoc = html;
    document.body.appendChild(marco);
  }));
  return cola;
};
