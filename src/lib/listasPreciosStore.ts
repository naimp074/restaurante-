import { useEffect, useState } from 'react';
import type { ListaPrecio, MetodoListaPrecio, Pedido } from './types';
import { writeStore } from './storeSync';

export const listasPreciosStorageKey = 'restaurant-listas-precios';
export const listasPreciosUpdatedEvent = 'restaurant-listas-precios-updated';

export const metodosListasPrecio: Array<{
  metodo: MetodoListaPrecio;
  nombre: string;
  descripcion: string;
}> = [
  { metodo: 'efectivo', nombre: 'Efectivo', descripcion: 'Pagos realizados en efectivo' },
  { metodo: 'transferencia', nombre: 'Transferencia', descripcion: 'Pagos por transferencia bancaria' },
  { metodo: 'tarjeta', nombre: 'Tarjeta', descripcion: 'Pagos registrados como tarjeta general' },
  { metodo: 'debito', nombre: 'Tarjeta de débito', descripcion: 'Pagos con tarjeta de débito' },
  { metodo: 'credito', nombre: 'Tarjeta de crédito', descripcion: 'Pagos con tarjeta de crédito' },
];

const limitarPorcentaje = (valor: number) => Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));

const crearLista = (metodo: MetodoListaPrecio): ListaPrecio => {
  const config = metodosListasPrecio.find(item => item.metodo === metodo)!;
  return {
    id: `lista-${metodo}`,
    nombre: config.nombre,
    metodo_pago: metodo,
    tipo_ajuste: metodo === 'efectivo' || metodo === 'transferencia' ? 'descuento' : 'recargo',
    descuento_general: 0,
    descuentos_productos: {},
    updated_at: new Date().toISOString(),
  };
};

export const loadListasPrecios = (): ListaPrecio[] => {
  let guardadas: ListaPrecio[] = [];

  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(listasPreciosStorageKey);
      const parsed = saved ? JSON.parse(saved) as ListaPrecio[] : [];
      if (Array.isArray(parsed)) guardadas = parsed;
    } catch {
      guardadas = [];
    }
  }

  return metodosListasPrecio.map(({ metodo }) => {
    const guardada = guardadas.find(lista => lista.metodo_pago === metodo);
    const base = crearLista(metodo);
    if (!guardada) return base;
    return {
      ...base,
      ...guardada,
      descuento_general: limitarPorcentaje(Number(guardada.descuento_general)),
      descuentos_productos: Object.fromEntries(
        Object.entries(guardada.descuentos_productos || {}).map(([productoId, descuento]) => [
          productoId,
          limitarPorcentaje(Number(descuento)),
        ]),
      ),
    };
  });
};

export const saveListasPrecios = (listas: ListaPrecio[]) => {
  if (typeof window === 'undefined') return;
  writeStore(listasPreciosStorageKey, listas, listasPreciosUpdatedEvent);
};

export const useListasPrecios = () => {
  const [listas, setListas] = useState<ListaPrecio[]>(loadListasPrecios);

  useEffect(() => {
    const sincronizar = () => setListas(loadListasPrecios());
    window.addEventListener(listasPreciosUpdatedEvent, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(listasPreciosUpdatedEvent, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  return listas;
};

export const getDescuentoProducto = (lista: ListaPrecio, productoId: string) => {
  if (Object.prototype.hasOwnProperty.call(lista.descuentos_productos, productoId)) {
    return limitarPorcentaje(lista.descuentos_productos[productoId]);
  }
  return limitarPorcentaje(lista.descuento_general);
};

export const calcularDescuentoLista = (pedido: Pedido, lista?: ListaPrecio | null) => {
  if (!lista) return 0;
  const descuento = (pedido.items || [])
    .filter(item => item.estado !== 'cancelado')
    .reduce((total, item) => {
      const porcentaje = getDescuentoProducto(lista, item.producto_id);
      return total + item.subtotal * porcentaje / 100;
    }, 0);

  return Number(descuento.toFixed(2));
};

export const calcularAjusteLista = calcularDescuentoLista;
