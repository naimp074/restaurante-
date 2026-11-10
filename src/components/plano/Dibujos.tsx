import type { ColoresEstado } from '../../lib/estadoMesa';
import { limitar, SILLA_ALTO, SEPARACION_SILLA as SEPARACION } from '../../lib/planoMesas';
import type { ElementoPlano, PlanoMesa } from '../../lib/types';

/**
 * Dibujos vistos desde arriba, centrados en (0, 0). Quien los usa los traslada y rota.
 * Los textos se contra-rotan para que el número se lea derecho aunque la mesa esté girada.
 */

type PropsMesa = {
  layout: PlanoMesa;
  etiqueta: string;
  capacidad: number;
  colores: ColoresEstado;
  /** Minutos con la comanda abierta; se muestra debajo del número si entra. */
  minutos?: number;
};

const SillasEnLados = ({ ancho, alto, capacidad, borde, banquetas }: { ancho: number; alto: number; capacidad: number; borde: string; banquetas?: boolean }) => {
  const maximoPorLado = Math.max(1, Math.floor(ancho / 24));
  const arriba = limitar(Math.ceil(capacidad / 2), 1, maximoPorLado);
  const abajo = limitar(capacidad - arriba, 0, maximoPorLado);
  const sillas: { x: number; y: number }[] = [];
  const fila = (cantidad: number, y: number) => {
    for (let i = 0; i < cantidad; i += 1) sillas.push({ x: -ancho / 2 + (ancho / cantidad) * (i + 0.5), y });
  };
  fila(arriba, -alto / 2 - SEPARACION - SILLA_ALTO / 2);
  fila(abajo, alto / 2 + SEPARACION + SILLA_ALTO / 2);
  const anchoSilla = Math.min(22, ancho / Math.max(arriba, abajo, 1) - 6);
  return (
    <g>
      {sillas.map((silla, i) => (banquetas ? (
        <circle key={i} cx={silla.x} cy={silla.y} r={SILLA_ALTO / 2 + 1} fill="#ffffff" stroke={borde} strokeOpacity={0.55} strokeWidth={1.5} />
      ) : (
        <rect
          key={i}
          x={silla.x - anchoSilla / 2}
          y={silla.y - SILLA_ALTO / 2}
          width={anchoSilla}
          height={SILLA_ALTO}
          rx={3}
          fill="#ffffff"
          stroke={borde}
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />
      )))}
    </g>
  );
};

const SillasEnRonda = ({ rx, ry, capacidad, borde }: { rx: number; ry: number; capacidad: number; borde: string }) => {
  const cantidad = limitar(capacidad, 2, 10);
  return (
    <g>
      {Array.from({ length: cantidad }, (_, i) => {
        const angulo = (i / cantidad) * 360 - 90;
        const rad = (angulo * Math.PI) / 180;
        const x = Math.cos(rad) * (rx + SEPARACION + SILLA_ALTO / 2);
        const y = Math.sin(rad) * (ry + SEPARACION + SILLA_ALTO / 2);
        return (
          <rect
            key={i}
            x={-9}
            y={-SILLA_ALTO / 2}
            width={18}
            height={SILLA_ALTO}
            rx={3}
            transform={`translate(${x} ${y}) rotate(${angulo + 90})`}
            fill="#ffffff"
            stroke={borde}
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
};

const Textos = ({ etiqueta, minutos, colores, lado, rotacion }: { etiqueta: string; minutos?: number; colores: ColoresEstado; lado: number; rotacion: number }) => {
  const largo = Math.max(1, etiqueta.length);
  const base = limitar(lado * 0.42, 11, 34);
  const tamanio = largo > 2 ? base * Math.min(1, 2.6 / largo) : base;
  const conReloj = minutos !== undefined && lado >= 56;
  return (
    <g transform={`rotate(${-rotacion})`} style={{ pointerEvents: 'none' }}>
      <text
        y={conReloj ? -4 : 0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={tamanio}
        fontWeight={800}
        fill={colores.texto}
        style={{ fontFamily: 'inherit' }}
      >
        {etiqueta}
      </text>
      {conReloj && (
        <text y={tamanio * 0.5 + 6} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={600} fill={colores.texto} opacity={0.75}>
          {minutos! < 60 ? `${minutos}'` : `${Math.floor(minutos! / 60)}h${String(minutos! % 60).padStart(2, '0')}`}
        </text>
      )}
    </g>
  );
};

export function DibujoMesa({ layout, etiqueta, capacidad, colores, minutos }: PropsMesa) {
  const { ancho, alto, forma, rotacion } = layout;
  const trazo = { fill: colores.relleno, stroke: colores.borde, strokeWidth: 2.5 };

  if (forma === 'box') {
    const sillon = alto * 0.27;
    const mesaAlto = alto - sillon * 2 - 8;
    const mesaAncho = ancho * 0.78;
    return (
      <g>
        {[-1, 1].map(lado => (
          <g key={lado}>
            <rect
              x={-ancho / 2}
              y={lado < 0 ? -alto / 2 : alto / 2 - sillon}
              width={ancho}
              height={sillon}
              rx={sillon / 2.5}
              fill={colores.relleno}
              fillOpacity={0.55}
              stroke={colores.borde}
              strokeOpacity={0.7}
              strokeWidth={1.5}
            />
            {/* Almohadones */}
            {[1, 2].map(division => (
              <line
                key={division}
                x1={-ancho / 2 + (ancho / 3) * division}
                x2={-ancho / 2 + (ancho / 3) * division}
                y1={lado < 0 ? -alto / 2 + 3 : alto / 2 - sillon + 3}
                y2={lado < 0 ? -alto / 2 + sillon - 3 : alto / 2 - 3}
                stroke={colores.borde}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            ))}
          </g>
        ))}
        <rect x={-mesaAncho / 2} y={-mesaAlto / 2} width={mesaAncho} height={mesaAlto} rx={6} {...trazo} />
        <Textos etiqueta={etiqueta} colores={colores} lado={Math.min(mesaAncho, mesaAlto * 2.1)} rotacion={rotacion} minutos={mesaAlto >= 44 ? minutos : undefined} />
      </g>
    );
  }

  if (forma === 'redonda') {
    return (
      <g>
        <SillasEnRonda rx={ancho / 2} ry={alto / 2} capacidad={capacidad} borde={colores.borde} />
        <ellipse rx={ancho / 2} ry={alto / 2} {...trazo} />
        <Textos etiqueta={etiqueta} colores={colores} lado={Math.min(ancho, alto)} rotacion={rotacion} minutos={minutos} />
      </g>
    );
  }

  return (
    <g>
      <SillasEnLados ancho={ancho} alto={alto} capacidad={capacidad} borde={colores.borde} banquetas={forma === 'alta'} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx={forma === 'alta' ? ancho / 2.5 : 8} {...trazo} />
      <Textos etiqueta={etiqueta} colores={colores} lado={Math.min(ancho, alto)} rotacion={rotacion} minutos={minutos} />
    </g>
  );
}

const TextoElemento = ({ texto, ancho, alto, rotacion, color, tamanio }: { texto?: string; ancho: number; alto: number; rotacion: number; color: string; tamanio?: number }) => {
  if (!texto) return null;
  // En una franja angosta y alta el texto va a lo largo, como en un plano de verdad.
  const vertical = alto > ancho * 1.6;
  const largoDisponible = vertical ? alto : ancho;
  const fuente = tamanio ?? limitar(Math.min(largoDisponible / Math.max(texto.length * 0.62, 1), (vertical ? ancho : alto) * 0.5, 22), 9, 22);
  const giro = vertical ? -90 : 0;
  // Si quedaría cabeza abajo, se da vuelta.
  const total = ((rotacion + giro) % 360 + 360) % 360;
  const corregido = total > 90 && total < 270 ? giro + 180 : giro;
  return (
    <text
      transform={`rotate(${corregido})`}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fuente}
      fontWeight={600}
      fill={color}
      letterSpacing={0.5}
      style={{ pointerEvents: 'none' }}
    >
      {texto}
    </text>
  );
};

export function DibujoElemento({ elemento }: { elemento: ElementoPlano }) {
  const { tipo, ancho, alto, rotacion, texto } = elemento;
  const x = -ancho / 2;
  const y = -alto / 2;

  switch (tipo) {
    case 'pared':
      return <rect x={x} y={y} width={ancho} height={alto} rx={2} fill="#475569" />;
    case 'puerta': {
      // Hueco en la pared + hoja abierta + recorrido de apertura.
      const hoja = ancho;
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} fill="#ffffff" />
          <line x1={x} y1={0} x2={x} y2={-hoja} stroke="#64748b" strokeWidth={2.5} strokeLinecap="round" />
          <path d={`M ${x} ${-hoja} A ${hoja} ${hoja} 0 0 1 ${x + hoja} 0`} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 4" />
        </g>
      );
    }
    case 'ingreso':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} rx={4} fill="#fff7ed" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4" />
          <TextoElemento texto={texto || 'Ingreso'} ancho={ancho} alto={alto} rotacion={rotacion} color="#b45309" tamanio={Math.min(14, alto * 0.55)} />
        </g>
      );
    case 'cocina':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} rx={6} fill="#fff7ed" stroke="#fdba74" strokeWidth={2} />
          {/* Hornallas */}
          {[-1, 1].map(fila => [-1, 1].map(col => (
            <circle key={`${fila}${col}`} cx={col * Math.min(ancho, 80) * 0.18} cy={-alto * 0.22 + fila * Math.min(ancho, 80) * 0.18} r={Math.min(ancho, 80) * 0.1} fill="none" stroke="#fb923c" strokeWidth={1.5} />
          )))}
          <TextoElemento texto={texto || 'Cocina'} ancho={ancho} alto={alto * 0.6} rotacion={rotacion} color="#c2410c" tamanio={18} />
        </g>
      );
    case 'bano':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} rx={6} fill="#eff6ff" stroke="#93c5fd" strokeWidth={2} />
          <ellipse cx={0} cy={-alto * 0.2} rx={Math.min(ancho, 60) * 0.16} ry={Math.min(ancho, 60) * 0.22} fill="none" stroke="#60a5fa" strokeWidth={1.5} />
          <TextoElemento texto={texto || 'Baño'} ancho={ancho} alto={alto * 0.5} rotacion={rotacion} color="#1d4ed8" tamanio={17} />
        </g>
      );
    case 'barra':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} rx={alto / 3} fill="#e7e5e4" stroke="#a8a29e" strokeWidth={2} />
          <TextoElemento texto={texto} ancho={ancho} alto={alto} rotacion={rotacion} color="#57534e" />
        </g>
      );
    case 'zona':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} rx={8} fill="#f8fafc" fillOpacity={0.7} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="8 6" />
          <TextoElemento texto={texto} ancho={ancho} alto={alto} rotacion={rotacion} color="#94a3b8" />
        </g>
      );
    case 'etiqueta':
      return (
        <g>
          <rect x={x} y={y} width={ancho} height={alto} fill="transparent" />
          <TextoElemento texto={texto || 'Texto'} ancho={ancho} alto={alto} rotacion={rotacion} color="#64748b" tamanio={limitar(alto * 0.6, 9, 40)} />
        </g>
      );
    case 'planta':
      return (
        <g>
          <circle r={Math.min(ancho, alto) / 2} fill="#dcfce7" stroke="#86efac" strokeWidth={1.5} />
          <circle r={Math.min(ancho, alto) / 4} fill="#86efac" />
        </g>
      );
    default:
      return null;
  }
}
