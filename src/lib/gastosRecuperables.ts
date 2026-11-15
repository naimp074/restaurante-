import type { Gasto, MovimientoFinanciero, Profile } from './types';
import { cuentaCajaDiaId } from './finance';

/*
  Gastos que salieron de una cuenta pero no quedaron en la lista de gastos.
  Pasaba cuando un cajero pagaba algo desde la caja del día: la salida de plata se
  guardaba, pero el servidor le rechazaba el gasto. Con estas salidas se puede
  volver a armar el gasto sin descontar la plata otra vez.
*/

const motivosReversion = ['Anulacion de gasto: ', 'Edicion de gasto: '];

const clave = (fecha: string, cuenta: string | undefined, monto: number, descripcion: string) =>
  `${fecha}|${cuenta || ''}|${Math.round(monto * 100)}|${descripcion.trim()}`;

/** Las salidas que dejó registradas cada gasto existente. */
const salidasDeGasto = (gasto: Gasto): string[] => {
  if (gasto.metodo_pago === 'mixto' && gasto.pagos_divididos?.length) {
    return gasto.pagos_divididos.map(parte => clave(
      gasto.fecha, parte.cuenta_id, parte.monto,
      `${gasto.concepto} (${parte.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'})`,
    ));
  }
  const monto = gasto.compra_id ? gasto.monto_pagado || 0 : gasto.monto;
  return [clave(gasto.fecha, gasto.cuenta_origen_id, monto, gasto.concepto)];
};

export type GastoRecuperable = { movimiento: MovimientoFinanciero; gasto: Gasto };

export const gastosRecuperables = (
  gastos: Gasto[],
  movimientos: MovimientoFinanciero[],
  usuarios: Pick<Profile, 'id' | 'nombre' | 'apellido'>[] = [],
): GastoRecuperable[] => {
  // Salidas que ya tienen su gasto.
  const conGasto = new Map<string, number>();
  gastos.forEach(gasto => salidasDeGasto(gasto).forEach(k => conGasto.set(k, (conGasto.get(k) || 0) + 1)));

  // Salidas de gastos que después se borraron o editaron: la plata ya volvió a la cuenta.
  const revertidas = new Map<string, number>();
  movimientos
    .filter(mov => mov.tipo === 'entrada' && mov.origen === 'ajuste')
    .forEach(mov => {
      const motivo = motivosReversion.find(m => mov.descripcion.startsWith(m));
      if (!motivo) return;
      const k = clave('', mov.cuenta_id, mov.monto, mov.descripcion.slice(motivo.length));
      revertidas.set(k, (revertidas.get(k) || 0) + 1);
    });

  const usar = (mapa: Map<string, number>, k: string) => {
    const n = mapa.get(k) || 0;
    if (!n) return false;
    mapa.set(k, n - 1);
    return true;
  };

  const salidas = movimientos
    .filter(mov => mov.tipo === 'salida' && mov.origen === 'gasto' && mov.monto > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const huerfanas = salidas.filter(mov => !usar(conGasto, clave(mov.fecha, mov.cuenta_id, mov.monto, mov.descripcion)));
  return huerfanas
    .filter(mov => !usar(revertidas, clave('', mov.cuenta_id, mov.monto, mov.descripcion)))
    .map(mov => {
      const concepto = mov.descripcion.trim() || 'Gasto';
      const esSueldo = /^sueldo\b/i.test(concepto);
      const empleado = esSueldo
        ? usuarios.find(u => concepto.toLowerCase().startsWith(`sueldo ${`${u.nombre} ${u.apellido || ''}`.trim().toLowerCase()} ·`))
        : undefined;
      const gasto: Gasto = {
        // Id fijo por salida: si dos equipos recuperan lo mismo, no se duplica.
        id: `gasto-recuperado-${mov.id}`,
        fecha: mov.fecha,
        concepto,
        categoria: esSueldo ? 'sueldo' : 'extra',
        alcance: mov.cuenta_id === cuentaCajaDiaId ? 'caja_dia' : 'general',
        metodo_pago: mov.metodo_pago || 'efectivo',
        monto: mov.monto,
        observaciones: 'Recuperado de los movimientos de plata',
        created_at: mov.created_at,
        creado_por: mov.creado_por,
        cuenta_origen_id: mov.cuenta_id,
        proveedor_id: mov.proveedor_id,
        comprobante: '',
        estado: 'pagado',
        vencimiento: mov.fecha,
        recurrente: false,
        empleado_id: empleado?.id,
        periodo: empleado ? mov.fecha.slice(0, 7) : undefined,
      };
      return { movimiento: mov, gasto };
    });
};
