import { useEffect, useRef, useState } from 'react';
import { usePedidos } from './demoStore';
import { sonar } from './avisoPedidos';
import { cobroEnCurso, estadoCobro } from './cobroComanda';
import { etiquetaPedido } from './pedidosCanal';
import type { Pedido } from './types';

/**
 * Avisos del cobro de comandas, en cualquier pantalla. Llegan por la misma sincronización
 * en tiempo real que trae las comandas: no hay un canal aparte.
 */

/** Caja: cuántas solicitudes esperan, y un pitido cuando entra una nueva. */
export const useSolicitudesCobro = (activo: boolean) => {
  const pedidos = usePedidos();
  const pendientes = activo ? pedidos.filter(p => cobroEnCurso(p) && p.solicitud_cobro?.estado === 'solicitado') : [];
  const vistos = useRef<Set<string> | null>(null);
  const clave = pendientes.map(p => p.solicitud_cobro!.id).join('|');

  useEffect(() => {
    const ids = new Set(clave ? clave.split('|') : []);
    // Al abrir el sistema solo se registra lo que ya había: suena por lo que llega después.
    if (vistos.current && [...ids].some(id => !vistos.current!.has(id))) sonar();
    vistos.current = ids;
  }, [clave]);

  return pendientes.length;
};

export type AvisoMoza = { id: string; texto: string; tono: 'ok' | 'info' | 'error' };

const avisoDe = (pedido: Pedido): AvisoMoza | null => {
  const solicitud = pedido.solicitud_cobro;
  if (!solicitud) return null;
  const mesa = etiquetaPedido(pedido);
  const estado = estadoCobro(pedido);
  if (estado === 'pagada') return { id: `${solicitud.id}:pagada`, texto: `${mesa}: pagada`, tono: 'ok' };
  if (estado === 'ticket_emitido') return { id: `${solicitud.id}:ticket`, texto: `${mesa}: ticket listo en caja`, tono: 'info' };
  if (estado === 'rechazada') return { id: `${solicitud.id}:rechazada`, texto: `${mesa}: caja devolvió el cobro`, tono: 'error' };
  return null;
};

/** Moza: lo que caja resolvió de los cobros que pidió ella. */
export const useAvisosMoza = (userId: string | undefined) => {
  const pedidos = usePedidos();
  const [avisos, setAvisos] = useState<AvisoMoza[]>([]);
  const vistos = useRef<Set<string> | null>(null);
  const actuales = userId
    ? pedidos.filter(p => p.solicitud_cobro?.solicitada_por_id === userId).map(avisoDe).filter((a): a is AvisoMoza => Boolean(a))
    : [];
  const clave = actuales.map(a => a.id).join('|');

  useEffect(() => {
    const lista = actuales;
    if (vistos.current) {
      const nuevos = lista.filter(aviso => !vistos.current!.has(aviso.id));
      if (nuevos.length) {
        sonar();
        setAvisos(previos => [...nuevos, ...previos].slice(0, 4));
      }
    }
    vistos.current = new Set(lista.map(aviso => aviso.id));
    // actuales se recalcula en cada render; la clave resume lo que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const descartar = (id: string) => setAvisos(previos => previos.filter(aviso => aviso.id !== id));
  return { avisos, descartar };
};
