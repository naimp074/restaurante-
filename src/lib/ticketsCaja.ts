import type { Pago, Pedido } from './types';
import { anularTicket, conEvento, type Actor } from './cobroComanda';
import { loadDemoPedidos, saveDemoPedidos } from './demoStore';
import { loadPagos, savePagos } from './pagosStore';
import { loadCajasDiarias, saveCajasDiarias } from './cajaStore';
import { cuentaBancoId, cuentaCajaDiaId, registrarSalidaCuenta } from './finance';
import { reponerStockPorVenta } from './ventasStock';
import { sincronizarEstadoMesa } from './mesasStore';
import { etiquetaPedido } from './pedidosCanal';
import { dayKey } from './fechas';
import { withStoreTransaction } from './storeSync';

export const desglosePago = (pago: Pago) => ({
  efectivo: pago.monto_efectivo || 0,
  transferencia: pago.monto_transferencia || 0,
  tarjeta: (pago.monto_tarjeta || 0) + (pago.monto_debito || 0) + (pago.monto_credito || 0),
});

/** El cobro quedó como ticket: no se manda a ARCA. */
export const marcarTicketSinArca = (pagoId: string) => {
  const pagos = loadPagos();
  if (!pagos.some(p => p.id === pagoId)) throw new Error('Ese cobro ya no está.');
  savePagos(pagos.map(p => (p.id === pagoId ? { ...p, tipo_comprobante: 'ticket' } : p)));
};

/** Aplica un cambio a una comanda abierta y refresca el plano. */
export const aplicarEnComanda = (pedidoId: string, cambio: (pedido: Pedido) => Pedido): Pedido => {
  const actuales = loadDemoPedidos();
  const guardado = actuales.find(p => p.id === pedidoId);
  if (!guardado || guardado.estado === 'cobrado' || guardado.estado === 'cuenta_corriente' || guardado.estado === 'cancelado') {
    throw new Error('La comanda ya está cerrada.');
  }
  const final = cambio(guardado);
  saveDemoPedidos(actuales.map(p => (p.id === final.id ? final : p)));
  sincronizarEstadoMesa(final.mesa_id);
  return final;
};

/**
 * Anula un cobro ya registrado: devuelve el stock, saca la plata de la caja del día
 * y deja la comanda otra vez en caja. Si el ticket impreso fijaba el medio de pago,
 * lo anula para poder cobrar de otra forma.
 */
export const anularCobroRegistrado = (pago: Pago, actor: Actor, motivo: string) => {
  const texto = motivo.trim();
  if (!texto) throw new Error('Escribí por qué se cancela el cobro.');
  if (!pago.pedido) throw new Error('Este cobro no tiene la comanda guardada.');
  if (!loadPagos().some(p => p.id === pago.id)) throw new Error('Ese cobro ya no está.');

  const fecha = dayKey(pago.created_at);
  const caja = loadCajasDiarias().find(item => item.fecha === fecha && item.estado === 'abierta');
  if (!caja) throw new Error('La caja de ese día ya está cerrada. No se puede cancelar el cobro.');

  const partes = desglosePago(pago);
  const previo = pago.pedido;
  const base: Pedido = {
    ...previo,
    estado: previo.estado === 'cobrado' ? 'entregado' : previo.estado,
    updated_at: new Date().toISOString(),
  };
  delete base.hora_cierre;
  let restaurado = conEvento(base, actor, 'pago_anulado', texto);
  if (restaurado.solicitud_cobro?.estado === 'ticket_emitido') {
    restaurado = anularTicket(restaurado, texto, actor);
  }

  const referencia = etiquetaPedido(restaurado);
  withStoreTransaction(() => {
    (
      [
        { cuenta_id: cuentaCajaDiaId, monto: partes.efectivo, detalle: 'efectivo' },
        { cuenta_id: cuentaBancoId, monto: partes.transferencia, detalle: 'transferencia' },
        { cuenta_id: cuentaBancoId, monto: partes.tarjeta, detalle: 'tarjeta' },
      ] as const
    )
      .filter(parte => parte.monto > 0)
      .forEach(parte => {
        registrarSalidaCuenta({
          cuenta_id: parte.cuenta_id,
          monto: parte.monto,
          origen: 'ajuste',
          fecha,
          descripcion: `Anulación de venta ${referencia} - ${parte.detalle}: ${texto}`,
        });
      });

    reponerStockPorVenta(restaurado);
    const pedidos = loadDemoPedidos();
    saveDemoPedidos(pedidos.some(p => p.id === restaurado.id)
      ? pedidos.map(p => (p.id === restaurado.id ? restaurado : p))
      : [restaurado, ...pedidos]);
    savePagos(loadPagos().filter(p => p.id !== pago.id));
    saveCajasDiarias(loadCajasDiarias().map(item => (
      item.id !== caja.id
        ? item
        : {
            ...item,
            efectivo: Math.max(0, item.efectivo - partes.efectivo),
            tarjeta: Math.max(0, item.tarjeta - partes.tarjeta),
            transferencia: Math.max(0, item.transferencia - partes.transferencia),
            total_ventas: Math.max(0, item.total_ventas - pago.total_cobrado),
            monto_esperado_efectivo: Math.max(item.monto_inicial, item.monto_esperado_efectivo - partes.efectivo),
          }
    )));
    sincronizarEstadoMesa(restaurado.mesa_id);
  });
};
