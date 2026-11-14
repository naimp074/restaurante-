import type { EventoComanda, Mesa, MetodoPago, Pedido, PedidoItem, RepartoMixto, Rol, SolicitudCobro, TipoEventoComanda } from './types';
import { nuevoId } from './ids';

/**
 * Cobro de una comanda de salón en dos manos:
 *
 *   moza:  "Cobrar comanda" -> solicitado
 *   caja:  imprime el ticket -> ticket_emitido
 *   caja:  confirma el pago  -> pagada (la comanda pasa a 'cobrado' con el cobro de siempre)
 *   caja:  la devuelve       -> rechazada (la moza corrige y vuelve a pedir)
 *
 * La solicitud viaja dentro de la comanda, así llega a caja por la misma sincronización.
 * Mientras está en caja el importe no se puede tocar: primero se cancela o se devuelve.
 * El servidor repite estas reglas para moza y cocina (migración 20261110000000).
 */

export type EstadoCobro = 'pendiente' | EstadoSolicitud;
type EstadoSolicitud = SolicitudCobro['estado'];

export type Actor = { id?: string; nombre: string; rol?: Rol };

export const estadoCobroConfig: Record<EstadoCobro, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente de cobro', clase: 'bg-slate-100 text-slate-600 border-slate-200' },
  solicitado: { label: 'Cobro solicitado', clase: 'bg-amber-100 text-amber-800 border-amber-200' },
  ticket_emitido: { label: 'Ticket emitido', clase: 'bg-blue-100 text-blue-700 border-blue-200' },
  pagada: { label: 'Pagada', clase: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rechazada: { label: 'Solicitud rechazada', clase: 'bg-red-100 text-red-700 border-red-200' },
};

/** Lo que puede elegir la moza. En mixto anota cuánto paga con cada medio. */
export const mediosSolicitud: { id: MetodoPago; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito', label: 'Tarjeta de débito' },
  { id: 'credito', label: 'Tarjeta de crédito' },
  { id: 'mercado_pago', label: 'Mercado Pago' },
  { id: 'mixto', label: 'Pago mixto' },
];

export const mediosReparto: { id: keyof RepartoMixto; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito', label: 'Tarjeta de débito' },
  { id: 'credito', label: 'Tarjeta de crédito' },
];

const centavos = (monto: number) => Math.round(monto * 100) / 100;

export const totalReparto = (reparto: RepartoMixto) =>
  centavos(mediosReparto.reduce((suma, medio) => suma + (reparto[medio.id] || 0), 0));

/** "Efectivo $5.000 + Transferencia $3.800". */
export const describirReparto = (reparto: RepartoMixto) => mediosReparto
  .filter(medio => reparto[medio.id] > 0)
  .map(medio => `${medio.label} $${reparto[medio.id].toLocaleString('es-AR')}`)
  .join(' + ');

/** Por qué el reparto no sirve para ese total, o null si está bien. */
export const errorReparto = (reparto: RepartoMixto | undefined, total: number): string | null => {
  if (!reparto) return 'Anotá cuánto paga con cada medio.';
  const montos = mediosReparto.map(medio => reparto[medio.id] || 0);
  if (!montos.every(monto => Number.isFinite(monto) && monto >= 0)) return 'Los importes no pueden ser negativos.';
  if (montos.filter(monto => monto > 0).length < 2) return 'Un pago mixto usa dos medios o más.';
  const diferencia = centavos(total - totalReparto(reparto));
  if (diferencia > 0) return `Faltan $${diferencia.toLocaleString('es-AR')} para llegar al total.`;
  if (diferencia < 0) return `Te pasaste $${(-diferencia).toLocaleString('es-AR')} del total.`;
  return null;
};

export const nombreMedio = (metodo?: MetodoPago) =>
  mediosSolicitud.find(medio => medio.id === metodo)?.label ?? (metodo === 'tarjeta' ? 'Tarjeta' : 'Sin elegir');

const cerrada = (pedido: Pedido) => pedido.estado === 'cobrado' || pedido.estado === 'cuenta_corriente' || pedido.estado === 'cancelado';

export const estadoCobro = (pedido: Pedido): EstadoCobro => {
  if (pedido.estado === 'cobrado' || pedido.estado === 'cuenta_corriente') return 'pagada';
  return pedido.solicitud_cobro?.estado ?? 'pendiente';
};

/** Solicitado o con ticket: caja la está trabajando. */
export const cobroEnCurso = (pedido: Pedido) => {
  const estado = pedido.solicitud_cobro?.estado;
  return !cerrada(pedido) && (estado === 'solicitado' || estado === 'ticket_emitido');
};

const vivos = (pedido: Pedido) => (pedido.items || []).filter(item => item.estado !== 'cancelado');

/**
 * Cargado pero no mandado a cocina. Una comanda que nunca se envió tiene todo sin enviar;
 * en una ya enviada, solo lo marcado al agregarlo (los ítems de antes de esta marca ya los ve cocina).
 */
export const itemSinEnviar = (item: PedidoItem, pedido: Pick<Pedido, 'estado'>) =>
  item.estado === 'pendiente' && (pedido.estado === 'abierto' || Boolean(item.sin_enviar));

export const itemsSinEnviar = (pedido: Pedido) => vivos(pedido).filter(item => itemSinEnviar(item, pedido));

/** Lo que cocina tiene que ver de la comanda. */
export const itemsParaCocina = (pedido: Pedido) => (pedido.items || []).filter(item => item.estado !== 'cancelado' && !item.sin_enviar);

/** Cocina todavía no lo empezó: se puede corregir o sacar sin anular. */
export const itemEditable = (item: PedidoItem) => item.estado === 'pendiente';

/** Anular algo que ya salió de cocina queda para quien maneja la plata. */
export const puedeAnularItems = (rol?: Rol) => rol === 'admin' || rol === 'encargado';

export const subtotalDe = (items: PedidoItem[] = []) =>
  items.filter(item => item.estado !== 'cancelado').reduce((suma, item) => suma + item.subtotal, 0);

export const conTotales = (pedido: Pedido): Pedido => {
  const subtotal = subtotalDe(pedido.items);
  return { ...pedido, subtotal, total: subtotal - (pedido.descuento || 0) + (pedido.recargo || 0) };
};

const limiteHistorial = 200;

export const conEvento = (
  pedido: Pedido,
  actor: Actor,
  tipo: TipoEventoComanda,
  detalle: string,
  at = new Date().toISOString(),
): Pedido => {
  const evento: EventoComanda = { id: nuevoId('ev'), at, tipo, detalle, usuario_id: actor.id, usuario_nombre: actor.nombre || 'Sin usuario', total: pedido.total };
  return { ...pedido, historial: [...(pedido.historial || []), evento].slice(-limiteHistorial) };
};

const describir = (item: PedidoItem) => `${item.cantidad}x ${item.producto?.nombre || 'Producto'}`;

/** Por qué no se puede tocar el contenido de la comanda, o null si se puede. */
export const bloqueoEdicion = (pedido: Pedido): string | null => {
  if (cerrada(pedido)) return 'La comanda ya está cerrada.';
  const estado = pedido.solicitud_cobro?.estado;
  if (estado === 'solicitado') return 'Hay un pedido de cobro en caja. Cancelalo para poder modificar la comanda.';
  if (estado === 'ticket_emitido') return 'Caja ya imprimió el ticket. Para modificar la comanda, caja tiene que anularlo y devolverla.';
  return null;
};

/** Manda a cocina lo nuevo. Lo que ya estaba en cocina o entregado no se vuelve a mandar. */
export const enviarACocina = (pedido: Pedido, actor: Actor, at = new Date().toISOString()): Pedido => {
  const nuevos = itemsSinEnviar(pedido);
  if (!nuevos.length) return pedido;
  const ids = new Set(nuevos.map(item => item.id));
  const enviado: Pedido = {
    ...pedido,
    estado: 'en_preparacion',
    items: (pedido.items || []).map(item => {
      if (!ids.has(item.id)) return item;
      const limpio = { ...item, updated_at: at };
      delete limpio.sin_enviar;
      return limpio;
    }),
    updated_at: at,
  };
  return conEvento(enviado, actor, 'enviado_cocina', nuevos.map(describir).join(', '), at);
};

export const nuevaSolicitud = (
  pedido: Pedido,
  metodo: MetodoPago,
  actor: Actor,
  at = new Date().toISOString(),
  reparto?: RepartoMixto,
): Pedido => {
  if (cerrada(pedido)) throw new Error('La comanda ya está cerrada.');
  if (cobroEnCurso(pedido)) throw new Error('Esta comanda ya tiene un pedido de cobro en caja.');
  if (!vivos(pedido).length) throw new Error('La comanda no tiene productos para cobrar.');
  if (itemsSinEnviar(pedido).length) throw new Error('Hay productos sin enviar a cocina. Enviálos o sacalos antes de pedir el cobro.');
  if (!mediosSolicitud.some(medio => medio.id === metodo)) throw new Error('Elegí cómo va a pagar.');
  const problemaReparto = metodo === 'mixto' ? errorReparto(reparto, pedido.total) : null;
  if (problemaReparto) throw new Error(problemaReparto);
  const solicitud: SolicitudCobro = {
    id: nuevoId('sol'),
    estado: 'solicitado',
    metodo_pago: metodo,
    ...(metodo === 'mixto' && reparto ? { reparto: { ...reparto } } : {}),
    subtotal: pedido.subtotal,
    descuento: pedido.descuento || 0,
    recargo: pedido.recargo || 0,
    total: pedido.total,
    solicitada_at: at,
    solicitada_por_id: actor.id,
    solicitada_por_nombre: actor.nombre,
  };
  const conSolicitud: Pedido = { ...pedido, solicitud_cobro: solicitud, cuenta_pedida_at: pedido.cuenta_pedida_at || at, updated_at: at };
  return conEvento(conSolicitud, actor, 'cobro_solicitado', `${metodo === 'mixto' && reparto ? `Mixto: ${describirReparto(reparto)}` : nombreMedio(metodo)} ·$${pedido.total.toLocaleString('es-AR')}`, at);
};

/** La moza la retira antes de que caja imprima. Con ticket ya no: lo anula caja. */
export const cancelarSolicitud = (pedido: Pedido, actor: Actor, at = new Date().toISOString()): Pedido => {
  const solicitud = pedido.solicitud_cobro;
  if (!solicitud || (solicitud.estado !== 'solicitado' && solicitud.estado !== 'rechazada')) {
    throw new Error(solicitud?.estado === 'ticket_emitido'
      ? 'Caja ya imprimió el ticket: pedile que lo anule y te devuelva la comanda.'
      : 'No hay un pedido de cobro para cancelar.');
  }
  const sinSolicitud: Pedido = { ...pedido, solicitud_cobro: undefined, updated_at: at };
  delete sinSolicitud.solicitud_cobro;
  return solicitud.estado === 'solicitado' ? conEvento(sinSolicitud, actor, 'cobro_cancelado', 'Retirado por la moza', at) : sinSolicitud;
};

export type ImporteTicket = NonNullable<SolicitudCobro['ticket']>;

/** Caja imprimió el ticket: desde acá el importe queda fijo hasta que lo anule. */
export const marcarTicketEmitido = (pedido: Pedido, importe: ImporteTicket, actor: Actor, at = new Date().toISOString()): Pedido => {
  const solicitud = pedido.solicitud_cobro;
  if (!solicitud || !cobroEnCurso(pedido)) throw new Error('No hay un pedido de cobro activo.');
  if (solicitud.estado === 'ticket_emitido') return pedido;
  const actualizado: Pedido = {
    ...pedido,
    solicitud_cobro: { ...solicitud, estado: 'ticket_emitido', ticket_at: at, ticket_por_nombre: actor.nombre, ticket: importe },
    updated_at: at,
  };
  return conEvento(actualizado, actor, 'ticket_emitido', `${nombreMedio(importe.metodo_pago)} · $${importe.total.toLocaleString('es-AR')}`, at);
};

/** Caja anula el ticket impreso (otro medio, un descuento) y la solicitud vuelve a estar pendiente en caja. */
export const anularTicket = (pedido: Pedido, motivo: string, actor: Actor, at = new Date().toISOString()): Pedido => {
  const solicitud = pedido.solicitud_cobro;
  if (!solicitud || solicitud.estado !== 'ticket_emitido' || !cobroEnCurso(pedido)) throw new Error('No hay un ticket emitido para anular.');
  const texto = motivo.trim();
  if (!texto) throw new Error('Escribí por qué se anula el ticket.');
  const vuelta: SolicitudCobro = { ...solicitud, estado: 'solicitado' };
  delete vuelta.ticket;
  delete vuelta.ticket_at;
  delete vuelta.ticket_por_nombre;
  return conEvento({ ...pedido, solicitud_cobro: vuelta, updated_at: at }, actor, 'ticket_anulado', texto, at);
};

/** Lo que caja tiene que respetar al cobrar, o null si puede ajustar importes. */
export const importeFijado = (pedido: Pedido): ImporteTicket | null =>
  cobroEnCurso(pedido) && pedido.solicitud_cobro?.estado === 'ticket_emitido' ? pedido.solicitud_cobro.ticket ?? null : null;

export const rechazarSolicitud = (pedido: Pedido, motivo: string, actor: Actor, at = new Date().toISOString()): Pedido => {
  const solicitud = pedido.solicitud_cobro;
  if (!solicitud || !cobroEnCurso(pedido)) throw new Error('No hay un pedido de cobro activo.');
  const texto = motivo.trim();
  if (!texto) throw new Error('Escribí por qué la devolvés, así la moza sabe qué corregir.');
  const actualizado: Pedido = {
    ...pedido,
    solicitud_cobro: { ...solicitud, estado: 'rechazada', motivo_rechazo: texto, resuelta_at: at, resuelta_por_id: actor.id, resuelta_por_nombre: actor.nombre },
    updated_at: at,
  };
  const detalle = solicitud.estado === 'ticket_emitido' ? `Ticket anulado: ${texto}` : texto;
  return conEvento(actualizado, actor, 'cobro_rechazado', detalle, at);
};

/** Lo que se guarda en la comanda cuando caja registra el cobro. */
export const marcarPagada = (pedido: Pedido, pagoId: string, actor: Actor, at = new Date().toISOString()): Pedido => {
  const solicitud = pedido.solicitud_cobro;
  const actualizado: Pedido = solicitud && solicitud.estado !== 'rechazada'
    ? { ...pedido, solicitud_cobro: { ...solicitud, estado: 'pagada', pago_id: pagoId, resuelta_at: at, resuelta_por_id: actor.id, resuelta_por_nombre: actor.nombre } }
    : pedido;
  return conEvento(actualizado, actor, 'pagada', `$${pedido.total.toLocaleString('es-AR')}`, at);
};

/** El pedido de cobro ya no coincide con lo que suma la comanda. */
export const solicitudDesactualizada = (pedido: Pedido) => {
  const solicitud = pedido.solicitud_cobro;
  return Boolean(solicitud && cobroEnCurso(pedido) && Math.abs(solicitud.total - pedido.total) > 0.009);
};

/**
 * Id del cobro que sale de una solicitud. Es fijo: si se confirma dos veces (doble toque,
 * dos cajas, un reintento sin conexión) los dos cobros son el mismo registro y no se duplica.
 */
export const pagoIdDeSolicitud = (solicitud: Pick<SolicitudCobro, 'id'>) => `pago-${solicitud.id.replace(/^sol-/, '')}`;

/** Corrige un ítem que cocina todavía no empezó. */
export const corregirItemPendiente = (
  pedido: Pedido,
  itemId: string,
  cambios: Partial<Pick<PedidoItem, 'cantidad' | 'observaciones' | 'opciones' | 'precio_unitario'>>,
  actor: Actor,
  at = new Date().toISOString(),
): Pedido => {
  const bloqueo = bloqueoEdicion(pedido);
  if (bloqueo) throw new Error(bloqueo);
  const item = (pedido.items || []).find(i => i.id === itemId);
  if (!item) throw new Error('Ese producto ya no está en la comanda.');
  if (!itemEditable(item)) throw new Error('Cocina ya lo empezó: solo se puede anular.');
  const cantidad = cambios.cantidad ?? item.cantidad;
  const precio = cambios.precio_unitario ?? item.precio_unitario;
  const enviado = !itemSinEnviar(item, pedido);
  let items: PedidoItem[];
  if (cantidad <= 0) {
    items = (pedido.items || []).filter(i => i.id !== itemId);
  } else {
    const nuevo: PedidoItem = { ...item, ...cambios, cantidad, precio_unitario: precio, subtotal: cantidad * precio, updated_at: at };
    if (cambios.opciones && !cambios.opciones.length) delete nuevo.opciones;
    items = (pedido.items || []).map(i => (i.id === itemId ? nuevo : i));
  }
  const corregido = conTotales({ ...pedido, items, updated_at: at });
  if (!enviado) return corregido;
  // Cocina ya lo tenía en pantalla: queda anotado quién lo cambió.
  const detalle = cantidad <= 0
    ? `${describir(item)} (sin empezar en cocina)`
    : `${describir(item)} → ${cantidad}x${cambios.observaciones !== undefined && cambios.observaciones !== item.observaciones ? `, aclaración: "${cambios.observaciones}"` : ''}`;
  return conEvento(corregido, actor, cantidad <= 0 ? 'item_eliminado' : 'item_modificado', detalle, at);
};

/** Anula un ítem que cocina ya empezó, preparó o entregó. Queda en la comanda tachado. */
export const anularItem = (pedido: Pedido, itemId: string, motivo: string, actor: Actor, at = new Date().toISOString()): Pedido => {
  if (!puedeAnularItems(actor.rol)) throw new Error('Solo un encargado o un administrador puede anular productos que ya salieron de cocina.');
  const bloqueo = bloqueoEdicion(pedido);
  if (bloqueo) throw new Error(bloqueo);
  const texto = motivo.trim();
  if (!texto) throw new Error('Escribí el motivo de la anulación.');
  const item = (pedido.items || []).find(i => i.id === itemId);
  if (!item || item.estado === 'cancelado') throw new Error('Ese producto ya no está en la comanda.');
  const items = (pedido.items || []).map(i => (i.id === itemId
    ? { ...i, estado: 'cancelado' as const, anulado_por: actor.nombre, motivo_anulacion: texto, updated_at: at }
    : i));
  const anulado = conTotales({ ...pedido, items, updated_at: at });
  return conEvento(anulado, actor, 'item_anulado', `${describir(item)}: ${texto}`, at);
};

const nombreMesa = (mesa?: Pick<Mesa, 'nombre' | 'numero'> | null) =>
  mesa ? (mesa.nombre && !/^\d+$/.test(mesa.nombre.trim()) ? mesa.nombre : `Mesa ${mesa.numero}`) : 'Sin mesa';

/**
 * Una comanda que quedó sin productos (la abrieron y no cargaron nada, o sacaron todo) se cierra
 * sin cobro y la mesa queda libre. Con algo cargado no: eso se cobra, o se saca/anula primero.
 */
export const liberarComandaVacia = (pedido: Pedido, actor: Actor, at = new Date().toISOString()): Pedido => {
  if (cerrada(pedido)) throw new Error('La comanda ya está cerrada.');
  if (cobroEnCurso(pedido)) throw new Error('Hay un cobro en caja para esta comanda.');
  if (vivos(pedido).length > 0) throw new Error('La comanda tiene productos: cobrala, o sacá o anulá los productos antes de liberar la mesa.');
  const liberada: Pedido = { ...pedido, estado: 'cancelado', hora_cierre: at, updated_at: at };
  return conEvento(liberada, actor, 'comanda_liberada', 'Comanda sin productos', at);
};

/**
 * Los clientes se cambian de mesa: la comanda entera (productos, lo que ya está en cocina, el
 * pedido de cobro) pasa a la mesa nueva. La de antes queda libre. Solo a una mesa libre.
 */
export const cambiarDeMesa = (
  pedido: Pedido,
  destino: Mesa,
  pedidos: Pedido[],
  actor: Actor,
  at = new Date().toISOString(),
): Pedido => {
  if (cerrada(pedido)) throw new Error('La comanda ya está cerrada.');
  if (destino.id === pedido.mesa_id) throw new Error('La comanda ya está en esa mesa.');
  if (destino.estado === 'cerrada') throw new Error(`${nombreMesa(destino)} está fuera de servicio.`);
  const ocupada = pedidos.find(otro => otro.id !== pedido.id && otro.mesa_id === destino.id && !cerrada(otro));
  if (ocupada) throw new Error(`${nombreMesa(destino)} ya tiene una comanda abierta. Elegí una mesa libre.`);
  const movido: Pedido = { ...pedido, mesa_id: destino.id, mesa: destino, updated_at: at };
  return conEvento(movido, actor, 'mesa_cambiada', `${nombreMesa(pedido.mesa)} → ${nombreMesa(destino)}`, at);
};
