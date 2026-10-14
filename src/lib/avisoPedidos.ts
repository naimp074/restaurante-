import { useEffect, useRef } from 'react';
import { usePedidos } from './demoStore';
import type { Pedido } from './types';

// Local (sin importar pedidosExternos) para no sumar finanzas al archivo inicial.
const pedidoAbierto = (pedido: Pedido) => !['cobrado', 'cuenta_corriente', 'cancelado'].includes(pedido.estado);

/** Dos pitidos cortos. Los navegadores solo dejan sonar después de que se tocó la pantalla. */
const sonar = () => {
  try {
    const Contexto = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    const ctx = new Contexto();
    [0, 0.25].forEach(inicio => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.frequency.value = 880;
      vol.gain.setValueAtTime(0.25, ctx.currentTime + inicio);
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.2);
      osc.connect(vol).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.2);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // Sin audio disponible: queda el aviso visual.
  }
};

/**
 * Pedidos de PedidosYa esperando que alguien los acepte. Si no se aceptan a tiempo,
 * PedidosYa los cancela y puede pausar el local: por eso suena en cualquier pantalla.
 */
export const usePedidosYaPendientes = (activo: boolean) => {
  const pedidos = usePedidos();
  const pendientes = activo
    ? pedidos.filter(p => p.canal === 'pedidosya' && p.externo?.estado_plataforma === 'pendiente' && pedidoAbierto(p))
    : [];
  const vistos = useRef<Set<string> | null>(null);
  const clave = pendientes.map(p => p.id).join('|');

  useEffect(() => {
    const ids = new Set(clave ? clave.split('|') : []);
    // La primera vez solo se registra lo que ya había: no suena al abrir el sistema.
    if (vistos.current && [...ids].some(id => !vistos.current!.has(id))) sonar();
    vistos.current = ids;
  }, [clave]);

  // Mientras haya pedidos sin aceptar, recuerda cada 30 segundos.
  useEffect(() => {
    if (!clave) return;
    const intervalo = window.setInterval(sonar, 30_000);
    return () => window.clearInterval(intervalo);
  }, [clave]);

  return pendientes.length;
};
