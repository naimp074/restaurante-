import type { Ingrediente, MovimientoStock, Pedido, ProduccionPreparada, RegistroProduccion } from './types';
import { mockIngredientes, mockPedidos, mockProducciones } from './mockData';

export const demoPedidosStorageKey = 'restaurant-demo-pedidos';
export const demoIngredientesStorageKey = 'restaurant-demo-ingredientes';
export const demoMovimientosStockStorageKey = 'restaurant-demo-movimientos-stock';
export const demoProduccionesStorageKey = 'restaurant-demo-producciones';
export const demoRegistrosProduccionStorageKey = 'restaurant-demo-registros-produccion';

const readStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
};

const writeStorage = <T>(key: string, value: T) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const initialMovimientosStock = (): MovimientoStock[] => mockIngredientes.map(ing => ({
  id: `mov-inicial-${ing.id}`,
  ingrediente_id: ing.id,
  tipo: 'entrada',
  cantidad: ing.stock_actual,
  motivo: 'Stock inicial',
  stock_anterior: 0,
  stock_nuevo: ing.stock_actual,
  created_at: ing.created_at || new Date().toISOString(),
  ingrediente: ing,
}));

export const loadDemoPedidos = () => readStorage<Pedido[]>(demoPedidosStorageKey, mockPedidos);
export const saveDemoPedidos = (pedidos: Pedido[]) => {
  writeStorage(demoPedidosStorageKey, pedidos);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('restaurant-pedidos-updated'));
};

export const loadDemoIngredientes = () => readStorage<Ingrediente[]>(demoIngredientesStorageKey, mockIngredientes);
export const saveDemoIngredientes = (ingredientes: Ingrediente[]) => writeStorage(demoIngredientesStorageKey, ingredientes);

export const loadDemoMovimientosStock = () =>
  readStorage<MovimientoStock[]>(demoMovimientosStockStorageKey, initialMovimientosStock());

export const saveDemoMovimientosStock = (movimientos: MovimientoStock[]) =>
  writeStorage(demoMovimientosStockStorageKey, movimientos);

export const loadDemoProducciones = () =>
  readStorage<ProduccionPreparada[]>(demoProduccionesStorageKey, mockProducciones);

export const saveDemoProducciones = (producciones: ProduccionPreparada[]) =>
  writeStorage(demoProduccionesStorageKey, producciones);

export const loadDemoRegistrosProduccion = () =>
  readStorage<RegistroProduccion[]>(demoRegistrosProduccionStorageKey, []);

export const saveDemoRegistrosProduccion = (registros: RegistroProduccion[]) =>
  writeStorage(demoRegistrosProduccionStorageKey, registros);

export const resetDemoData = () => {
  if (typeof window === 'undefined') return;
  [
    demoPedidosStorageKey,
    demoIngredientesStorageKey,
    demoMovimientosStockStorageKey,
    demoProduccionesStorageKey,
    demoRegistrosProduccionStorageKey,
  ].forEach(key => window.localStorage.removeItem(key));
};
