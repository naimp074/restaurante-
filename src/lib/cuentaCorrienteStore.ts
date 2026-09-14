import { useEffect, useState } from 'react';
import type { MetodoPago, Pedido } from './types';
import { loadDemoPedidos, saveDemoPedidos } from './demoStore';
import { loadCajasDiarias, saveCajasDiarias } from './cajaStore';
import { cuentaBancoId, cuentaCajaDiaId, registrarEntradaCuenta } from './finance';
import { loadMesas, saveMesas } from './mesasStore';
import { descontarStockPorVenta, reponerStockPorVenta } from './ventasStock';
import { registrarSalidaCuenta } from './finance';
import { sincronizarEstadoMesa } from './mesasStore';
import { dayKey } from './fechas';
import { writeStore } from './storeSync';

export interface ClienteCuenta {
  id: string;
  nombre: string;
  telefono: string;
  nota: string;
  tipo_documento: 'DNI' | 'CUIT' | 'CUIL';
  numero_documento: string;
  condicion_iva: string;
  domicilio: string;
}

export type MedioCobroCuenta = Exclude<MetodoPago, 'mixto'>;
export const mediosCobroCuenta: Record<MedioCobroCuenta, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', debito: 'Débito', credito: 'Crédito',
};
export interface MovimientoCuenta {
  id: string;
  cliente_id: string;
  tipo: 'consumo' | 'pago' | 'ajuste';
  monto: number;
  descripcion: string;
  created_at: string;
  responsable: string;
  pedido?: Pedido;
  metodo_pago?: MedioCobroCuenta;
  caja_id?: string;
}
interface CuentaStore { clientes: ClienteCuenta[]; movimientos: MovimientoCuenta[] }
export const cuentaCorrienteStorageKey = 'restaurant-cuenta-corriente';
const eventName = 'restaurant-cuenta-corriente-updated';
export const dinero = (monto: number) => Math.round((monto + Number.EPSILON) * 100) / 100;
const centavos = (monto: number) => Math.round(monto * 100);
export const loadCuentaCorriente = (): CuentaStore => {
  const saved = window.localStorage.getItem(cuentaCorrienteStorageKey);
  if (!saved) return { clientes: [], movimientos: [] };
  const parsed = JSON.parse(saved) as CuentaStore;
  if (!Array.isArray(parsed.clientes) || !Array.isArray(parsed.movimientos)) throw new Error('No se pudo leer la cuenta corriente guardada.');
  return parsed;
};
const save = (data: CuentaStore) => writeStore(cuentaCorrienteStorageKey, data, eventName);
export const saldoCliente = (clienteId: string, movimientos = loadCuentaCorriente().movimientos) =>
  movimientos.filter(m => m.cliente_id === clienteId).reduce((saldo, m) => saldo + centavos(m.monto) * (m.tipo === 'pago' ? -1 : 1), 0) / 100;

export const useCuentaCorriente = () => {
  const [data, setData] = useState(loadCuentaCorriente);
  useEffect(() => {
    const refresh = () => setData(loadCuentaCorriente());
    window.addEventListener(eventName, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(eventName, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return data;
};

// Serializa las operaciones entre pestañas y revierte todas las escrituras si alguna falla.
// Usa el almacenamiento local del sistema; no sincroniza entre dispositivos.
export const transaccionCuenta = async <T,>(action: () => T): Promise<T> => {
  const execute = () => {
    const keys = [cuentaCorrienteStorageKey, 'restaurant-demo-pedidos', 'restaurant-demo-ingredientes',
      'restaurant-demo-movimientos-stock', 'restaurant-demo-producciones', 'restaurant-mesas',
      'restaurant-cajas-diarias', 'restaurant-cuentas-dinero', 'restaurant-movimientos-financieros'];
    const previous = keys.map(key => [key, window.localStorage.getItem(key)] as const);
    try {
      const result = action();
      window.dispatchEvent(new CustomEvent(eventName));
      return result;
    } catch (error) {
      previous.forEach(([key, value]) => {
        if (window.localStorage.getItem(key) === value) return;
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      });
      window.dispatchEvent(new CustomEvent('restaurant-pedidos-updated'));
      window.dispatchEvent(new CustomEvent('restaurant-mesas-updated'));
      window.dispatchEvent(new CustomEvent(eventName));
      throw error;
    }
  };
  return navigator.locks ? navigator.locks.request('restaurant-cobros', execute) : execute();
};

export const guardarClienteCuenta = (cliente: ClienteCuenta) => transaccionCuenta(() => {
  if (!cliente.nombre.trim()) throw new Error('Ingresá el nombre del cliente.');
  const data = loadCuentaCorriente();
  const documento = cliente.numero_documento.replace(/\D/g, '');
  if (documento && data.clientes.some(c => c.id !== cliente.id && c.numero_documento.replace(/\D/g, '') === documento)) {
    throw new Error('Ya existe un cliente con ese documento.');
  }
  const limpio = { ...cliente, nombre: cliente.nombre.trim(), telefono: cliente.telefono.trim(), nota: cliente.nota.trim() };
  save({ ...data, clientes: [limpio, ...data.clientes.filter(c => c.id !== cliente.id)] });
  return limpio;
});

const cajaActual = () => {
  const caja = loadCajasDiarias().find(c => c.fecha === dayKey() && c.estado === 'abierta');
  if (!caja) throw new Error('Abrí la caja del día antes de registrar la operación.');
  return caja;
};

const ingresarPago = (monto: number, metodo: MedioCobroCuenta, nombre: string, cajaId: string) => {
  if (!Object.prototype.hasOwnProperty.call(mediosCobroCuenta, metodo)) throw new Error('Seleccioná un medio de pago válido.');
  const efectivo = metodo === 'efectivo' ? monto : 0;
  const transferencia = metodo === 'transferencia' ? monto : 0;
  saveCajasDiarias(loadCajasDiarias().map(c => c.id !== cajaId ? c : {
    ...c, efectivo: dinero(c.efectivo + efectivo), transferencia: dinero(c.transferencia + transferencia),
    tarjeta: dinero(c.tarjeta + (efectivo || transferencia ? 0 : monto)),
    monto_esperado_efectivo: dinero(c.monto_esperado_efectivo + efectivo),
    cobros_cuenta_corriente: dinero((c.cobros_cuenta_corriente || 0) + monto),
  }));
  registrarEntradaCuenta({ cuenta_id: efectivo ? cuentaCajaDiaId : cuentaBancoId, monto,
    origen: 'cobro_cuenta_corriente', descripcion: `Cobro de cuenta corriente: ${nombre} (${mediosCobroCuenta[metodo]})` });
};

export const pasarPedidoACuenta = (args: {
  pedido: Pedido; cliente_id: string; descuento: number; recargo: number;
  anticipo: number; metodo: MedioCobroCuenta; responsable: string;
}) => transaccionCuenta(() => {
  const data = loadCuentaCorriente();
  const cliente = data.clientes.find(c => c.id === args.cliente_id);
  if (!cliente) throw new Error('Seleccioná un cliente guardado para dejar el consumo a cuenta.');
  const pedidos = loadDemoPedidos();
  const pedido = pedidos.find(p => p.id === args.pedido.id);
  if (!pedido || ['cobrado', 'cuenta_corriente', 'cancelado'].includes(pedido.estado)
    || data.movimientos.some(m => m.tipo === 'consumo' && m.pedido?.id === pedido.id)) {
    throw new Error('Esta comanda ya está cerrada o no está disponible.');
  }
  if (JSON.stringify(pedido) !== JSON.stringify(args.pedido)) throw new Error('La comanda cambió. Volvé a seleccionarla antes de cerrar.');
  if (!(pedido.items || []).some(i => i.estado !== 'cancelado')) throw new Error('La comanda no tiene productos.');
  if (![args.descuento, args.recargo, args.anticipo].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Revisá los importes ingresados.');
  const total = dinero(pedido.subtotal - args.descuento + args.recargo);
  const anticipo = dinero(args.anticipo);
  if (!Number.isFinite(total) || total <= 0 || anticipo >= total) throw new Error('El pago inicial debe ser menor al total. Para pagar todo, usá el cobro habitual.');
  const caja = cajaActual();
  const ahora = new Date().toISOString();
  const cerrado: Pedido = { ...pedido, cliente_id: cliente.id, estado: 'cuenta_corriente',
    descuento: dinero(args.descuento), recargo: dinero(args.recargo), total, hora_cierre: ahora, updated_at: ahora };
  const consumo: MovimientoCuenta = { id: `consumo-${pedido.id}`, cliente_id: cliente.id, tipo: 'consumo',
    monto: total, descripcion: `Consumo · ${pedido.mesa?.nombre || (pedido.mesa?.numero ? `Mesa ${pedido.mesa.numero}` : 'Comanda')}`,
    created_at: ahora, responsable: args.responsable, pedido: cerrado, caja_id: caja.id };
  const nuevos = [consumo];
  descontarStockPorVenta(cerrado);
  saveCajasDiarias(loadCajasDiarias().map(c => c.id !== caja.id ? c : { ...c,
    total_ventas: dinero(c.total_ventas + total), ventas_cuenta_corriente: dinero((c.ventas_cuenta_corriente || 0) + total) }));
  if (anticipo > 0) {
    ingresarPago(anticipo, args.metodo, cliente.nombre, caja.id);
    nuevos.push({ id: `anticipo-${pedido.id}`, cliente_id: cliente.id, tipo: 'pago', monto: anticipo,
      descripcion: 'Pago inicial del consumo', metodo_pago: args.metodo, responsable: args.responsable, created_at: ahora, caja_id: caja.id });
  }
  save({ ...data, movimientos: [...data.movimientos, ...nuevos] });
  saveDemoPedidos(pedidos.map(p => p.id === pedido.id ? cerrado : p));
  if (!pedidos.some(p => p.id !== pedido.id && p.mesa_id === pedido.mesa_id && !['cobrado', 'cuenta_corriente', 'cancelado'].includes(p.estado))) {
    saveMesas(loadMesas().map(m => m.id === pedido.mesa_id ? { ...m, estado: 'libre', empleado_id: undefined, updated_at: ahora } : m));
  }
  return { cliente, pendiente: dinero(total - anticipo), saldo: saldoCliente(cliente.id) };
});

export const registrarPagoCuenta = (args: {
  id: string; cliente_id: string; monto: number; metodo: MedioCobroCuenta; responsable: string; nota: string;
}) => transaccionCuenta(() => {
  const data = loadCuentaCorriente();
  if (data.movimientos.some(m => m.id === args.id)) return;
  const cliente = data.clientes.find(c => c.id === args.cliente_id);
  if (!cliente) throw new Error('El cliente no existe.');
  const monto = dinero(args.monto);
  if (!Number.isFinite(monto) || monto <= 0 || monto > saldoCliente(cliente.id, data.movimientos)) throw new Error('Ingresá un pago mayor a cero y que no supere la deuda.');
  const caja = cajaActual();
  ingresarPago(monto, args.metodo, cliente.nombre, caja.id);
  save({ ...data, movimientos: [...data.movimientos, { id: args.id, cliente_id: cliente.id, tipo: 'pago', monto,
    descripcion: args.nota.trim() || 'Pago de cuenta corriente', metodo_pago: args.metodo, responsable: args.responsable,
    caja_id: caja.id, created_at: new Date().toISOString() }] });
});

export const ajustarCuenta = (args: { id: string; cliente_id: string; monto: number; motivo: string; responsable: string }) => transaccionCuenta(() => {
  const data = loadCuentaCorriente();
  if (data.movimientos.some(m => m.id === args.id)) return;
  if (!data.clientes.some(c => c.id === args.cliente_id)) throw new Error('El cliente no existe.');
  const monto = dinero(args.monto);
  if (!Number.isFinite(monto) || monto === 0 || dinero(saldoCliente(args.cliente_id, data.movimientos) + monto) < 0) throw new Error('El ajuste no puede dejar un saldo negativo ni ser cero.');
  if (!args.motivo.trim()) throw new Error('Indicá el motivo del ajuste.');
  save({ ...data, movimientos: [...data.movimientos, { id: args.id, cliente_id: args.cliente_id,
    tipo: 'ajuste', monto, descripcion: args.motivo.trim(), responsable: args.responsable, created_at: new Date().toISOString() }] });
});

export const revertirConsumoCuenta = (args: { pedidoId: string; responsable: string }) => transaccionCuenta(() => {
  const data = loadCuentaCorriente();
  const consumo = data.movimientos.find(m => m.tipo === 'consumo' && m.pedido?.id === args.pedidoId);
  if (!consumo?.pedido) throw new Error('No encontré ese consumo para anular.');
  if (data.movimientos.some(m => m.id === `anula-${consumo.id}`)) throw new Error('Este consumo ya fue anulado.');

  const anticipos = data.movimientos.filter(m => m.cliente_id === consumo.cliente_id && m.tipo === 'pago' && (
    m.id === `anticipo-${args.pedidoId}` || (m.descripcion === 'Pago inicial del consumo' && Math.abs(new Date(m.created_at).getTime() - new Date(consumo.created_at).getTime()) < 2000)
  ));
  const pedido = consumo.pedido;
  reponerStockPorVenta(pedido);

  const restaurado: Pedido = {
    ...pedido,
    estado: 'abierto',
    hora_cierre: undefined,
    updated_at: new Date().toISOString(),
  };
  saveDemoPedidos(loadDemoPedidos().map(p => p.id === pedido.id ? restaurado : p));
  sincronizarEstadoMesa(pedido.mesa_id);

  saveCajasDiarias(loadCajasDiarias().map(c => {
    if (c.id !== consumo.caja_id) return c;
    const efectivo = anticipos.filter(m => m.metodo_pago === 'efectivo').reduce((s, m) => s + m.monto, 0);
    const transferencia = anticipos.filter(m => m.metodo_pago === 'transferencia').reduce((s, m) => s + m.monto, 0);
    const tarjeta = anticipos.filter(m => m.metodo_pago && m.metodo_pago !== 'efectivo' && m.metodo_pago !== 'transferencia').reduce((s, m) => s + m.monto, 0);
    const cobrado = anticipos.reduce((s, m) => s + m.monto, 0);
    return {
      ...c,
      total_ventas: dinero(Math.max(0, c.total_ventas - consumo.monto)),
      ventas_cuenta_corriente: dinero(Math.max(0, (c.ventas_cuenta_corriente || 0) - consumo.monto)),
      efectivo: dinero(Math.max(0, c.efectivo - efectivo)),
      transferencia: dinero(Math.max(0, c.transferencia - transferencia)),
      tarjeta: dinero(Math.max(0, c.tarjeta - tarjeta)),
      cobros_cuenta_corriente: dinero(Math.max(0, (c.cobros_cuenta_corriente || 0) - cobrado)),
      monto_esperado_efectivo: dinero(Math.max(c.monto_inicial || 0, c.monto_esperado_efectivo - efectivo)),
    };
  }));

  anticipos.forEach(pago => {
    if (!pago.metodo_pago) return;
    registrarSalidaCuenta({
      cuenta_id: pago.metodo_pago === 'efectivo' ? cuentaCajaDiaId : cuentaBancoId,
      monto: pago.monto,
      origen: 'ajuste',
      descripcion: `Anulación de anticipo de cuenta corriente: ${args.pedidoId}`,
    });
  });

  const ahora = new Date().toISOString();
  const contraasientos: MovimientoCuenta[] = [
    {
      id: `anula-${consumo.id}`,
      cliente_id: consumo.cliente_id,
      tipo: 'ajuste',
      monto: -consumo.monto,
      descripcion: `Anulación del consumo${pedido.mesa?.numero ? ` · Mesa ${pedido.mesa.numero}` : ''}`,
      responsable: args.responsable,
      created_at: ahora,
    },
    ...anticipos.map(pago => ({
      id: `anula-${pago.id}`,
      cliente_id: consumo.cliente_id,
      tipo: 'ajuste' as const,
      monto: pago.monto,
      descripcion: 'Devolución del pago inicial al anular el consumo',
      responsable: args.responsable,
      created_at: ahora,
    })),
  ];
  save({ ...data, movimientos: [...data.movimientos, ...contraasientos] });
  return restaurado;
});
