import type { CajaDiaria } from './types';
import { readStore, useStore, writeStore } from './storeSync';

export const cajasDiariasStorageKey = 'restaurant-cajas-diarias';
export const cajasUpdatedEvent = 'restaurant-cajas-updated';

export const loadCajasDiarias = (): CajaDiaria[] => readStore<CajaDiaria[]>(cajasDiariasStorageKey, []);

export const saveCajasDiarias = (cajas: CajaDiaria[]) =>
  writeStore(cajasDiariasStorageKey, cajas, cajasUpdatedEvent);

export const useCajas = () => useStore(cajasUpdatedEvent, loadCajasDiarias);

/**
 * El efectivo que tiene el cajón de la caja abierta (la de esa jornada, o la que quedó abierta).
 * Sin caja abierta es cero: al cerrar, el efectivo pasó a la Caja grande.
 */
export const efectivoEnCajaAbierta = (fecha?: string) => {
  const abiertas = loadCajasDiarias().filter(item => item.estado === 'abierta');
  const caja = (fecha && abiertas.find(item => item.fecha === fecha))
    || [...abiertas].sort((a, b) => (b.opened_at || b.fecha).localeCompare(a.opened_at || a.fecha))[0];
  return caja ? caja.monto_esperado_efectivo : 0;
};

/**
 * Resta o devuelve un gasto de efectivo de la caja del día.
 * Quien paga ya chequeó que el cajón tenga la plata (ver frenarGastoSinEfectivoEnCajaDia en finance.ts).
 */
export const aplicarGastoEnCajaDia = (fecha: string, monto: number, signo: 1 | -1) => {
  const cajas = loadCajasDiarias();
  const caja = cajas.find(item => item.fecha === fecha && item.estado === 'abierta');
  if (!caja) return;
  saveCajasDiarias(cajas.map(item => (
    item.id !== caja.id
      ? item
      : {
          ...item,
          monto_esperado_efectivo: item.monto_esperado_efectivo - monto * signo,
        }
  )));
};
