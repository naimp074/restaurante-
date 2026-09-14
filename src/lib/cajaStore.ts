import type { CajaDiaria } from './types';
import { readStore, useStore, writeStore } from './storeSync';

export const cajasDiariasStorageKey = 'restaurant-cajas-diarias';
export const cajasUpdatedEvent = 'restaurant-cajas-updated';

export const loadCajasDiarias = (): CajaDiaria[] => readStore<CajaDiaria[]>(cajasDiariasStorageKey, []);

export const saveCajasDiarias = (cajas: CajaDiaria[]) =>
  writeStore(cajasDiariasStorageKey, cajas, cajasUpdatedEvent);

export const useCajas = () => useStore(cajasUpdatedEvent, loadCajasDiarias);

/** Resta o devuelve un gasto de efectivo de la caja del día. */
export const aplicarGastoEnCajaDia = (fecha: string, monto: number, signo: 1 | -1) => {
  const cajas = loadCajasDiarias();
  const caja = cajas.find(item => item.fecha === fecha && item.estado === 'abierta');
  if (!caja) return;
  saveCajasDiarias(cajas.map(item => (
    item.id !== caja.id
      ? item
      : {
          ...item,
          monto_esperado_efectivo: Math.max(item.monto_inicial || 0, item.monto_esperado_efectivo - monto * signo),
        }
  )));
};
