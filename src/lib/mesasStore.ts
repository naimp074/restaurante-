import { useEffect, useState } from 'react';
import type { EstadoPedido, Mesa, PlanoSector, Sector } from './types';
import { loadDemoPedidos } from './demoStore';
import { nuevoId } from './ids';
import { readStore, useStore, writeStore } from './storeSync';

export type SectorOption = {
  id: string;
  label: string;
  /** Plano del apartado (paredes, cocina, medidas). Las mesas guardan su propia posición. */
  plano?: PlanoSector;
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

/** Los apartados se actualizan solos si otro dispositivo los cambia (o guarda un plano). */
export const useSectores = (): SectorOption[] => useStore(sectoresUpdatedEvent, loadSectores);

/** Una mesa nueva, igual desde "Nueva mesa" que desde el editor del plano. */
export const crearMesa = (numero: number, sector: string, datos: Partial<Mesa> = {}): Mesa => {
  const ahora = new Date().toISOString();
  return {
    id: nuevoId('mesa'),
    numero,
    capacidad: 4,
    estado: 'libre',
    sector: sector as Sector,
    posicion_x: Math.round(datos.plano?.x ?? 0),
    posicion_y: Math.round(datos.plano?.y ?? 0),
    activa: true,
    created_at: ahora,
    updated_at: ahora,
    ...datos,
  };
};

export const siguienteNumeroMesa = (mesas: Pick<Mesa, 'numero'>[]) =>
  mesas.reduce((mayor, mesa) => Math.max(mayor, mesa.numero), 0) + 1;

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
  // Para llevar, delivery y PedidosYa no tienen mesa: sin esto se recalculaban todas.
  if (mesaId === '') return;
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
