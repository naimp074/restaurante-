import { useEffect, useState } from 'react';
import type { PageId } from './types';
import { readStore } from './storeSync';

const configStorageKey = 'restaurant-config-local';
const configUpdatedEvent = 'restaurant-config-local-updated';

/** Pantallas que el admin puede sacar del menú mientras no las usa. Siguen andando si se entra por la dirección. */
export const pantallasOcultables: { label: string; paginas: PageId[] }[] = [
  { label: 'Pedidos (para llevar, delivery y PedidosYa)', paginas: ['pedidos_delivery'] },
  { label: 'Cuenta corriente', paginas: ['cuenta_corriente'] },
  { label: 'Facturas', paginas: ['facturas'] },
  { label: 'Stock', paginas: ['stock', 'stock_insumos', 'stock_consumos', 'stock_produccion'] },
  { label: 'Proveedores', paginas: ['proveedores'] },
  { label: 'Gastos', paginas: ['gastos', 'gastos_pagos', 'gastos_traspasos'] },
  { label: 'Costos y recetas', paginas: ['costos'] },
  { label: 'Reportes', paginas: ['reportes'] },
];

export const menuOcultoPorDefecto: PageId[] = ['pedidos_delivery'];

export const loadMenuOculto = (): PageId[] => {
  const guardado = readStore<{ menu_oculto?: unknown }>(configStorageKey, {}).menu_oculto;
  return Array.isArray(guardado) ? guardado.filter((p): p is PageId => typeof p === 'string') : menuOcultoPorDefecto;
};

export const useMenuOculto = (): PageId[] => {
  const [ocultas, setOcultas] = useState<PageId[]>(loadMenuOculto);

  useEffect(() => {
    const sincronizar = () => setOcultas(loadMenuOculto());
    window.addEventListener(configUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(configUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return ocultas;
};
