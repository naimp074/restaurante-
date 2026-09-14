import { useEffect, useState } from 'react';
import type { EstadoPedido, Mesa } from './types';
import { loadDemoPedidos } from './demoStore';
import { readStore, writeStore } from './storeSync';

export type SectorOption = {
  id: string;
  label: string;
};

export const sectoresStorageKey = 'restaurant-sectores-mesas';
export const mesasStorageKey = 'restaurant-mesas';
export const mesasUpdatedEvent = 'restaurant-mesas-updated';
export const sectoresUpdatedEvent = 'restaurant-sectores-mesas-updated';

export const initialSectores: SectorOption[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'salon', label: 'Salón' },
  { id: 'terraza', label: 'Terraza' },
  { id: 'barra', label: 'Barra' },
  { id: 'privado', label: 'Privado' },
];

export const loadMesas = (): Mesa[] => readStore<Mesa[]>(mesasStorageKey, []);

export const saveMesas = (mesas: Mesa[]) => writeStore(mesasStorageKey, mesas, mesasUpdatedEvent);

export const loadSectores = (): SectorOption[] => {
  if (typeof window === 'undefined') return initialSectores;
  try {
    const saved = window.localStorage.getItem(sectoresStorageKey);
    if (!saved) return initialSectores;
    const parsed = JSON.parse(saved) as SectorOption[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : initialSectores;
  } catch {
    return initialSectores;
  }
};

export const saveSectores = (sectores: SectorOption[]) =>
  writeStore(sectoresStorageKey, sectores, sectoresUpdatedEvent);

const pedidosCerrados: EstadoPedido[] = ['cobrado', 'cuenta_corriente', 'cancelado'];

export const mesaTienePedidoAbierto = (mesaId: string, pedidos = loadDemoPedidos()) =>
  pedidos.some(pedido => pedido.mesa_id === mesaId && !pedidosCerrados.includes(pedido.estado));

export const estadoOperativoMesa = (mesa: Mesa, pedidos = loadDemoPedidos()): Mesa['estado'] => {
  if (mesa.estado === 'cerrada') return 'cerrada';
  return mesaTienePedidoAbierto(mesa.id, pedidos) ? 'ocupada' : 'libre';
};

export const ocuparMesa = (mesaId: string, empleadoId?: string) => {
  const ahora = new Date().toISOString();
  saveMesas(loadMesas().map(mesa => (
    mesa.id !== mesaId
      ? mesa
      : {
          ...mesa,
          estado: mesa.estado === 'cerrada' ? mesa.estado : 'ocupada',
          empleado_id: empleadoId || mesa.empleado_id,
          updated_at: ahora,
        }
  )));
};

export const sincronizarEstadoMesa = (mesaId?: string) => {
  const pedidos = loadDemoPedidos();
  const ahora = new Date().toISOString();
  saveMesas(loadMesas().map(mesa => {
    if (mesaId && mesa.id !== mesaId) return mesa;
    const siguiente = estadoOperativoMesa(mesa, pedidos);
    if (siguiente === mesa.estado) return mesa;
    return { ...mesa, estado: siguiente, empleado_id: siguiente === 'libre' ? undefined : mesa.empleado_id, updated_at: ahora };
  }));
};

/** Mantiene las mesas sincronizadas entre pantallas abiertas al mismo tiempo. */
export const useMesas = (): Mesa[] => {
  const [mesas, setMesas] = useState<Mesa[]>(loadMesas);

  useEffect(() => {
    const sincronizar = () => setMesas(loadMesas());
    window.addEventListener(mesasUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(mesasUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return mesas;
};
