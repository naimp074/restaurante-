import type { GrupoOpciones, OpcionElegida, PedidoItem, Producto } from './types';

/** Qué opción eligió en cada grupo: { [grupoId]: [opcionId, ...] }. */
export type SeleccionOpciones = Record<string, string[]>;

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/** Grupos que se pueden mostrar al tomar el pedido: con nombre y al menos una opción. */
export const gruposDe = (producto?: Pick<Producto, 'grupos_opciones'>): GrupoOpciones[] =>
  (producto?.grupos_opciones || []).filter(grupo => grupo.nombre.trim() && grupo.opciones.some(o => o.nombre.trim()));

export const tieneOpciones = (producto?: Pick<Producto, 'grupos_opciones'>) => gruposDe(producto).length > 0;

/** Limpia lo que se cargó en el formulario antes de guardar el producto. */
export const limpiarGrupos = (grupos: GrupoOpciones[] = []): GrupoOpciones[] =>
  grupos
    .map(grupo => {
      const opciones = grupo.opciones
        .map(o => ({ ...o, nombre: o.nombre.trim(), precio_extra: Math.max(0, Number(o.precio_extra) || 0) }))
        .filter(o => o.nombre);
      const maximo = Math.min(Math.max(1, Math.floor(Number(grupo.maximo) || 1)), Math.max(1, opciones.length));
      return { ...grupo, nombre: grupo.nombre.trim(), maximo, opciones };
    })
    .filter(grupo => grupo.nombre && grupo.opciones.length > 0);

/** Toca una opción: si el grupo deja elegir una sola la reemplaza; si no, la suma o la saca. */
export const alternarOpcion = (grupo: GrupoOpciones, seleccion: SeleccionOpciones, opcionId: string): SeleccionOpciones => {
  const actuales = seleccion[grupo.id] || [];
  let nuevas: string[];
  if (actuales.includes(opcionId)) nuevas = actuales.filter(id => id !== opcionId);
  else if (grupo.maximo <= 1) nuevas = [opcionId];
  else if (actuales.length >= grupo.maximo) return seleccion;
  else nuevas = [...actuales, opcionId];
  return { ...seleccion, [grupo.id]: nuevas };
};

/** Nombres de los grupos obligatorios que todavía no tienen nada elegido. */
export const gruposFaltantes = (producto: Pick<Producto, 'grupos_opciones'>, seleccion: SeleccionOpciones) =>
  gruposDe(producto)
    .filter(grupo => grupo.obligatorio && !(seleccion[grupo.id] || []).some(id => grupo.opciones.some(o => o.id === id)))
    .map(grupo => grupo.nombre);

/** Pasa la selección a lo que se guarda en el ítem, en el orden de la carta. */
export const opcionesElegidas = (producto: Pick<Producto, 'grupos_opciones'>, seleccion: SeleccionOpciones): OpcionElegida[] =>
  gruposDe(producto).flatMap(grupo => grupo.opciones
    .filter(opcion => opcion.nombre.trim() && (seleccion[grupo.id] || []).includes(opcion.id))
    .map(opcion => ({ grupo: grupo.nombre, opcion: opcion.nombre, precio_extra: Math.max(0, opcion.precio_extra || 0) })));

export const precioConOpciones = (precioBase: number, opciones: OpcionElegida[] = []) =>
  redondear(precioBase + opciones.reduce((suma, o) => suma + (o.precio_extra || 0), 0));

/** "Bebida: Café · Aderezo: Mayonesa, Ketchup". Vacío si no eligió nada. */
export const textoOpciones = (opciones: OpcionElegida[] = []) => {
  const porGrupo = new Map<string, string[]>();
  opciones.forEach(o => porGrupo.set(o.grupo, [...(porGrupo.get(o.grupo) || []), o.opcion]));
  return [...porGrupo].map(([grupo, nombres]) => `${grupo}: ${nombres.join(', ')}`).join(' · ');
};

const clave = (opciones: OpcionElegida[] = []) => opciones.map(o => `${o.grupo}=${o.opcion}`).sort().join('|');

/** Dos ítems del mismo producto se suman en una sola línea solo si salen igual. */
export const salenIgual = (
  item: Pick<PedidoItem, 'producto_id' | 'opciones' | 'observaciones'>,
  productoId: string,
  opciones: OpcionElegida[] = [],
  observaciones = '',
) => item.producto_id === productoId && clave(item.opciones) === clave(opciones) && (item.observaciones || '').trim() === observaciones.trim();

const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Para el ticket impreso, que se arma como HTML: ya viene escapado. */
export const detalleTicket = (opciones?: OpcionElegida[], observaciones?: string) =>
  escaparHtml([textoOpciones(opciones), observaciones ? `* ${observaciones}` : ''].filter(Boolean).join(' · '));
