import { useEffect, useState } from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';
import type { PedidoItem } from '../lib/types';
import { formatoReloj, salidaDeItem, segundosDeItem } from '../lib/tiempoItem';

/** Verde hasta 10 minutos, amarillo hasta 15, rojo después (igual que la pantalla de Cocina). */
const colorEspera = (segundos: number) =>
  segundos < 600 ? 'text-emerald-700 bg-emerald-50' : segundos < 900 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';

/** Cuánto lleva el ítem desde que se pidió; cuando sale, queda fijo el tiempo que tardó. */
export default function RelojItem({ item, className = '' }: { item: PedidoItem; className?: string }) {
  const salio = Boolean(salidaDeItem(item));
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    if (salio || item.estado === 'cancelado') return;
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, [salio, item.estado]);

  if (item.estado === 'cancelado') return null;
  const segundos = segundosDeItem(item, ahora);
  const pedido = new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (salio) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums ${className}`}
        title={`Pedido a las ${pedido}`}
      >
        <CheckCircle2 size={12} className="text-emerald-600" />
        Salió en {formatoReloj(segundos)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${colorEspera(segundos)} ${className}`}
      title={`Pedido a las ${pedido}`}
      aria-label={`Lleva ${formatoReloj(segundos)} desde que se pidió`}
    >
      <Clock size={12} />
      {formatoReloj(segundos)}
    </span>
  );
}
