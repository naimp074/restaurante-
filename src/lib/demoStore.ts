import type { Ingrediente, MovimientoStock, Pedido, ProduccionPreparada, RegistroProduccion } from './types';
import { readStore, useStore, writeStore } from './storeSync';

export const demoPedidosStorageKey = 'restaurant-demo-pedidos';
export const demoIngredientesStorageKey = 'restaurant-demo-ingredientes';
export const demoMovimientosStockStorageKey = 'restaurant-demo-movimientos-stock';
export const demoProduccionesStorageKey = 'restaurant-demo-producciones';
export const demoRegistrosProduccionStorageKey = 'restaurant-demo-registros-produccion';

export const pedidosUpdatedEvent = 'restaurant-pedidos-updated';
export const ingredientesUpdatedEvent = 'restaurant-ingredientes-updated';
export const movimientosStockUpdatedEvent = 'restaurant-movimientos-stock-updated';
export const produccionesUpdatedEvent = 'restaurant-producciones-updated';
export const registrosProduccionUpdatedEvent = 'restaurant-registros-produccion-updated';

export const loadDemoPedidos = () => readStore<Pedido[]>(demoPedidosStorageKey, []);
export const saveDemoPedidos = (pedidos: Pedido[]) => writeStore(demoPedidosStorageKey, pedidos, pedidosUpdatedEvent);
export const usePedidos = () => useStore(pedidosUpdatedEvent, loadDemoPedidos);

export const loadDemoIngredientes = () => readStore<Ingrediente[]>(demoIngredientesStorageKey, []);
export const saveDemoIngredientes = (ingredientes: Ingrediente[]) =>
  writeStore(demoIngredientesStorageKey, ingredientes, ingredientesUpdatedEvent);
export const useIngredientes = () => useStore(ingredientesUpdatedEvent, loadDemoIngredientes);

export const loadDemoMovimientosStock = () => readStore<MovimientoStock[]>(demoMovimientosStockStorageKey, []);
export const saveDemoMovimientosStock = (movimientos: MovimientoStock[]) =>
  writeStore(demoMovimientosStockStorageKey, movimientos, movimientosStockUpdatedEvent);
export const useMovimientosStock = () => useStore(movimientosStockUpdatedEvent, loadDemoMovimientosStock);

export const loadDemoProducciones = () => readStore<ProduccionPreparada[]>(demoProduccionesStorageKey, []);
export const saveDemoProducciones = (producciones: ProduccionPreparada[]) =>
  writeStore(demoProduccionesStorageKey, producciones, produccionesUpdatedEvent);
export const useProducciones = () => useStore(produccionesUpdatedEvent, loadDemoProducciones);

export const loadDemoRegistrosProduccion = () => readStore<RegistroProduccion[]>(demoRegistrosProduccionStorageKey, []);
export const saveDemoRegistrosProduccion = (registros: RegistroProduccion[]) =>
  writeStore(demoRegistrosProduccionStorageKey, registros, registrosProduccionUpdatedEvent);
