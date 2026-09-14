import type { MovimientoStock, Pedido } from './types';
import {
  loadDemoIngredientes,
  loadDemoMovimientosStock,
  loadDemoProducciones,
  saveDemoIngredientes,
  saveDemoMovimientosStock,
  saveDemoProducciones,
} from './demoStore';
import { loadProductos } from './productosStore';

interface ConsumoVenta {
  ingredientes: Map<string, number>;
  producciones: Map<string, number>;
}

const acumular = (mapa: Map<string, number>, id: string, cantidad: number) => {
  mapa.set(id, (mapa.get(id) || 0) + cantidad);
};

/** Suma lo que consume cada combo del pedido segun su receta, multiplicado por la cantidad vendida. */
const calcularConsumo = (pedido: Pedido): ConsumoVenta => {
  const consumo: ConsumoVenta = { ingredientes: new Map(), producciones: new Map() };
  const catalogo = loadProductos();

  (pedido.items || [])
    .filter(item => item.estado !== 'cancelado')
    .forEach(item => {
      const producto = catalogo.find(p => p.id === item.producto_id) || item.producto;
      (producto?.receta || []).forEach(componente => {
        const cantidad = componente.cantidad * item.cantidad;
        if (!cantidad) return;

        if (componente.tipo === 'produccion') {
          if (componente.produccion_id) acumular(consumo.producciones, componente.produccion_id, cantidad);
        } else if (componente.ingrediente_id) {
          acumular(consumo.ingredientes, componente.ingrediente_id, cantidad);
        }
      });
    });

  return consumo;
};

const aplicarConsumo = (pedido: Pedido, signo: 1 | -1) => {
  const consumo = calcularConsumo(pedido);
  if (!consumo.ingredientes.size && !consumo.producciones.size) return;

  const ahora = new Date().toISOString();
  const referencia = pedido.mesa?.numero ? `Mesa ${pedido.mesa.numero}` : `Comanda ${pedido.id}`;

  if (consumo.ingredientes.size) {
    const movimientos: MovimientoStock[] = [];
    const ingredientes = loadDemoIngredientes().map(ingrediente => {
      const requerido = consumo.ingredientes.get(ingrediente.id);
      if (!requerido) return ingrediente;

      const stockNuevo = ingrediente.stock_actual - requerido * signo;
      const actualizado = { ...ingrediente, stock_actual: stockNuevo, updated_at: ahora };

      movimientos.push({
        id: `mov-venta-${signo === 1 ? '' : 'rev-'}${pedido.id}-${ingrediente.id}`,
        ingrediente_id: ingrediente.id,
        tipo: signo === 1 ? 'salida' : 'entrada',
        cantidad: requerido,
        motivo: signo === 1 ? `Venta - ${referencia}` : `Anulacion de venta - ${referencia}`,
        pedido_id: pedido.id,
        stock_anterior: ingrediente.stock_actual,
        stock_nuevo: stockNuevo,
        created_at: ahora,
        ingrediente: actualizado,
      });

      return actualizado;
    });

    saveDemoIngredientes(ingredientes);
    saveDemoMovimientosStock([...movimientos, ...loadDemoMovimientosStock()]);
  }

  if (consumo.producciones.size) {
    saveDemoProducciones(loadDemoProducciones().map(produccion => {
      const requerido = consumo.producciones.get(produccion.id);
      if (!requerido) return produccion;
      return {
        ...produccion,
        stock_actual: produccion.stock_actual - requerido * signo,
        updated_at: ahora,
      };
    }));
  }
};

/** Descuenta insumos y preparaciones al cerrar una venta, cobrada o a cuenta. */
export const descontarStockPorVenta = (pedido: Pedido) => aplicarConsumo(pedido, 1);

/** Devuelve al stock lo consumido si se anula el comprobante. */
export const reponerStockPorVenta = (pedido: Pedido) => aplicarConsumo(pedido, -1);
