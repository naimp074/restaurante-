import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { estadoMesaConfig } from '../../lib/estadoMesa';
import {
  aEjesLocales,
  ajustarAGrilla,
  dentroDelPlano,
  limitar,
  margenSillas,
  MINIMO_ELEMENTO,
  MINIMO_MESA,
  normalizarRotacion,
} from '../../lib/planoMesas';
import type { ElementoPlano, EstadoMesa, PlanoMesa, PlanoSector } from '../../lib/types';
import { DibujoElemento, DibujoMesa } from './Dibujos';

export type MesaEnPlano = {
  id: string;
  layout: PlanoMesa;
  etiqueta: string;
  nombreCompleto: string;
  capacidad: number;
  estado: EstadoMesa;
  minutos?: number;
};

export type SeleccionPlano = { tipo: 'mesa' | 'elemento'; id: string } | null;

type Props = {
  plano: PlanoSector;
  mesas: MesaEnPlano[];
  /** Miniatura: sin controles ni eventos. */
  estatico?: boolean;
  editando?: boolean;
  /** Paso de la grilla en unidades del plano; 0 la oculta y no imanta. */
  grilla?: number;
  seleccion?: SeleccionPlano;
  onSeleccionar?: (seleccion: SeleccionPlano) => void;
  onCambiarMesa?: (id: string, layout: PlanoMesa) => void;
  onCambiarElemento?: (id: string, elemento: ElementoPlano) => void;
  /** Se termina de arrastrar algo: el editor lo usa para guardar un paso de "deshacer". */
  onFinCambio?: () => void;
  onTocarMesa?: (id: string) => void;
  tooltip?: (id: string) => ReactNode;
  altoMaximo?: string;
};

type Vista = { zoom: number; cx: number; cy: number };

type Gesto =
  | { tipo: 'pan'; inicioX: number; inicioY: number; vista: Vista; mesaId?: string; movio: boolean }
  | { tipo: 'mover'; inicioX: number; inicioY: number; objeto: 'mesa' | 'elemento'; id: string; origen: { x: number; y: number }; movio: boolean }
  | { tipo: 'medida'; inicioX: number; inicioY: number; objeto: 'mesa' | 'elemento'; id: string; origen: { ancho: number; alto: number; rotacion: number }; movio: boolean }
  | { tipo: 'rotar'; objeto: 'mesa' | 'elemento'; id: string; centro: { x: number; y: number }; movio: boolean }
  | { tipo: 'pinza'; distancia: number; vista: Vista; movio: boolean };

const ZOOM_MAXIMO = 4;

export default function PlanoInteractivo({
  plano,
  mesas,
  estatico,
  editando,
  grilla = 0,
  seleccion,
  onSeleccionar,
  onCambiarMesa,
  onCambiarElemento,
  onFinCambio,
  onTocarMesa,
  tooltip,
  altoMaximo = '72vh',
}: Props) {
  const idPatron = useId().replace(/:/g, '');
  const contenedor = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tamanio, setTamanio] = useState({ ancho: 0, alto: 0 });
  const [vista, setVista] = useState<Vista>({ zoom: 1, cx: plano.ancho / 2, cy: plano.alto / 2 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const gesto = useRef<Gesto | null>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());

  // Datos frescos para los manejadores sin volver a enganchar eventos en cada render.
  const datos = useRef({ mesas, plano, grilla, vista });
  datos.current = { mesas, plano, grilla, vista };

  useLayoutEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const medir = () => setTamanio({ ancho: nodo.clientWidth, alto: nodo.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // Si cambian las medidas del plano, se vuelve a ver entero.
  useEffect(() => {
    setVista({ zoom: 1, cx: plano.ancho / 2, cy: plano.alto / 2 });
  }, [plano.ancho, plano.alto]);

  const anchoVista = plano.ancho / vista.zoom;
  const altoVista = plano.alto / vista.zoom;
  const viewBox = `${vista.cx - anchoVista / 2} ${vista.cy - altoVista / 2} ${anchoVista} ${altoVista}`;
  // Píxeles por unidad del plano con preserveAspectRatio="meet".
  const escala = tamanio.ancho && tamanio.alto ? Math.min(tamanio.ancho / anchoVista, tamanio.alto / altoVista) : 1;
  const unidadesPorPixel = 1 / escala;

  const acotar = useCallback((v: Vista): Vista => {
    const { plano: p } = datos.current;
    const zoom = limitar(v.zoom, 1, ZOOM_MAXIMO);
    const medioAncho = p.ancho / zoom / 2;
    const medioAlto = p.alto / zoom / 2;
    return {
      zoom,
      cx: limitar(v.cx, medioAncho, p.ancho - medioAncho),
      cy: limitar(v.cy, medioAlto, p.alto - medioAlto),
    };
  }, []);

  /** Pasa un punto de la pantalla a coordenadas del plano. */
  const aPlano = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const { plano: p, vista: v } = datos.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const aV = p.ancho / v.zoom;
    const hV = p.alto / v.zoom;
    const s = Math.min(rect.width / aV, rect.height / hV) || 1;
    const offX = (rect.width - aV * s) / 2;
    const offY = (rect.height - hV * s) / 2;
    return {
      x: v.cx - aV / 2 + (clientX - rect.left - offX) / s,
      y: v.cy - hV / 2 + (clientY - rect.top - offY) / s,
    };
  }, []);

  const zoomEn = useCallback((factor: number, foco?: { x: number; y: number }) => {
    setVista(actual => {
      const zoom = limitar(actual.zoom * factor, 1, ZOOM_MAXIMO);
      const centro = foco ?? { x: actual.cx, y: actual.cy };
      const relacion = actual.zoom / zoom;
      return acotar({ zoom, cx: centro.x + (actual.cx - centro.x) * relacion, cy: centro.y + (actual.cy - centro.y) * relacion });
    });
  }, [acotar]);

  // Ctrl + rueda (y el gesto de pellizco de los touchpads) acerca; la rueda sola sigue bajando la página.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || estatico) return;
    const alGirar = (evento: WheelEvent) => {
      if (!evento.ctrlKey && !evento.metaKey) return;
      evento.preventDefault();
      zoomEn(evento.deltaY < 0 ? 1.15 : 1 / 1.15, aPlano(evento.clientX, evento.clientY));
    };
    svg.addEventListener('wheel', alGirar, { passive: false });
    return () => svg.removeEventListener('wheel', alGirar);
  }, [aPlano, estatico, zoomEn]);

  const objetoBajo = (destino: EventTarget | null) => {
    const nodo = (destino as Element | null)?.closest?.('[data-plano]') as HTMLElement | SVGElement | null;
    if (!nodo) return null;
    return {
      tipo: nodo.dataset.plano as 'mesa' | 'elemento' | 'medida' | 'rotar',
      id: nodo.dataset.id || '',
      objeto: (nodo.dataset.objeto || 'mesa') as 'mesa' | 'elemento',
    };
  };

  const buscarObjeto = (objeto: 'mesa' | 'elemento', id: string) => {
    if (objeto === 'mesa') return datos.current.mesas.find(m => m.id === id)?.layout;
    return datos.current.plano.elementos.find(el => el.id === id);
  };

  const aplicar = (objeto: 'mesa' | 'elemento', id: string, cambio: Partial<PlanoMesa & ElementoPlano>) => {
    if (objeto === 'mesa') {
      const mesa = datos.current.mesas.find(m => m.id === id);
      if (mesa) onCambiarMesa?.(id, { ...mesa.layout, ...cambio });
    } else {
      const elemento = datos.current.plano.elementos.find(el => el.id === id);
      if (elemento) onCambiarElemento?.(id, { ...elemento, ...cambio });
    }
  };

  const alApretar = (evento: React.PointerEvent<SVGSVGElement>) => {
    if (estatico) return;
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    try { svgRef.current?.setPointerCapture(evento.pointerId); } catch { /* el puntero ya se soltó */ }
    setHover(null);

    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = { tipo: 'pinza', distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, vista: datos.current.vista, movio: true };
      return;
    }
    if (punteros.current.size > 2) return;

    const objetivo = objetoBajo(evento.target);
    if (editando && objetivo) {
      if (objetivo.tipo === 'medida' || objetivo.tipo === 'rotar') {
        const actual = buscarObjeto(objetivo.objeto, objetivo.id);
        if (!actual) return;
        gesto.current = objetivo.tipo === 'medida'
          ? { tipo: 'medida', inicioX: evento.clientX, inicioY: evento.clientY, objeto: objetivo.objeto, id: objetivo.id, origen: { ancho: actual.ancho, alto: actual.alto, rotacion: actual.rotacion }, movio: false }
          : { tipo: 'rotar', objeto: objetivo.objeto, id: objetivo.id, centro: { x: actual.x, y: actual.y }, movio: false };
        return;
      }
      const actual = buscarObjeto(objetivo.tipo as 'mesa' | 'elemento', objetivo.id);
      if (!actual) return;
      onSeleccionar?.({ tipo: objetivo.tipo as 'mesa' | 'elemento', id: objetivo.id });
      gesto.current = { tipo: 'mover', inicioX: evento.clientX, inicioY: evento.clientY, objeto: objetivo.tipo as 'mesa' | 'elemento', id: objetivo.id, origen: { x: actual.x, y: actual.y }, movio: false };
      return;
    }

    // Fuera del editor (o tocando el piso), arrastrar desplaza el plano y nunca mueve mesas.
    gesto.current = {
      tipo: 'pan',
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      vista: datos.current.vista,
      mesaId: !editando && objetivo?.tipo === 'mesa' ? objetivo.id : undefined,
      movio: false,
    };
  };

  const alMover = (evento: React.PointerEvent<SVGSVGElement>) => {
    if (estatico) return;
    const actual = gesto.current;

    if (!actual) {
      if (evento.pointerType !== 'mouse' || !tooltip) return;
      const objetivo = objetoBajo(evento.target);
      const rect = contenedor.current?.getBoundingClientRect();
      if (objetivo?.tipo === 'mesa' && rect) setHover({ id: objetivo.id, x: evento.clientX - rect.left, y: evento.clientY - rect.top });
      else if (hover) setHover(null);
      return;
    }

    if (!punteros.current.has(evento.pointerId)) return;
    punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    const { grilla: paso, plano: p } = datos.current;

    if (actual.tipo === 'pinza') {
      if (punteros.current.size < 2) return;
      const [a, b] = [...punteros.current.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      const medio = aPlano((a.x + b.x) / 2, (a.y + b.y) / 2);
      const zoom = limitar(actual.vista.zoom * (distancia / actual.distancia), 1, ZOOM_MAXIMO);
      const relacion = datos.current.vista.zoom / zoom;
      setVista(v => acotar({ zoom, cx: medio.x + (v.cx - medio.x) * relacion, cy: medio.y + (v.cy - medio.y) * relacion }));
      return;
    }

    if (actual.tipo === 'rotar') {
      const punto = aPlano(evento.clientX, evento.clientY);
      const grados = (Math.atan2(punto.y - actual.centro.y, punto.x - actual.centro.x) * 180) / Math.PI + 90;
      actual.movio = true;
      aplicar(actual.objeto, actual.id, { rotacion: normalizarRotacion(evento.shiftKey ? grados : Math.round(grados / 5) * 5) });
      return;
    }

    const dxPx = evento.clientX - actual.inicioX;
    const dyPx = evento.clientY - actual.inicioY;
    const umbral = evento.pointerType === 'mouse' ? 4 : 9;
    if (!actual.movio && Math.hypot(dxPx, dyPx) < umbral) return;
    actual.movio = true;
    const dx = dxPx * unidadesPorPixel;
    const dy = dyPx * unidadesPorPixel;

    if (actual.tipo === 'pan') {
      setVista(acotar({ ...actual.vista, cx: actual.vista.cx - dx, cy: actual.vista.cy - dy }));
      return;
    }

    if (actual.tipo === 'mover') {
      const destino = dentroDelPlano({ x: ajustarAGrilla(actual.origen.x + dx, paso / 2), y: ajustarAGrilla(actual.origen.y + dy, paso / 2) }, p);
      aplicar(actual.objeto, actual.id, destino);
      return;
    }

    // Agrandar desde la esquina: el centro queda fijo, así que crece para los dos lados.
    const local = aEjesLocales(dx, dy, actual.origen.rotacion);
    const minimo = actual.objeto === 'mesa' ? MINIMO_MESA : MINIMO_ELEMENTO;
    const ancho = limitar(ajustarAGrilla(actual.origen.ancho + local.dx * 2, paso / 2), minimo, p.ancho * 1.5);
    const alto = limitar(ajustarAGrilla(actual.origen.alto + local.dy * 2, paso / 2), minimo, p.alto * 1.5);
    aplicar(actual.objeto, actual.id, { ancho, alto });
  };

  const alSoltar = (evento: React.PointerEvent<SVGSVGElement>) => {
    if (estatico) return;
    punteros.current.delete(evento.pointerId);
    const actual = gesto.current;
    if (punteros.current.size > 0) {
      // Terminó la pinza: lo que queda apoyado sigue desplazando desde donde está.
      const [resto] = [...punteros.current.values()];
      gesto.current = { tipo: 'pan', inicioX: resto.x, inicioY: resto.y, vista: datos.current.vista, movio: true };
      return;
    }
    gesto.current = null;
    if (!actual) return;
    if (evento.type === 'pointercancel') {
      if (actual.movio && actual.tipo !== 'pan' && actual.tipo !== 'pinza') onFinCambio?.();
      return;
    }
    if (actual.tipo === 'pan' && !actual.movio) {
      if (actual.mesaId) onTocarMesa?.(actual.mesaId);
      else if (editando) onSeleccionar?.(null);
      return;
    }
    if (actual.movio && actual.tipo !== 'pan' && actual.tipo !== 'pinza') onFinCambio?.();
  };

  const seleccionada = (tipo: 'mesa' | 'elemento', id: string) => seleccion?.tipo === tipo && seleccion.id === id;

  const manijas = ({ ancho, alto, objeto, id, margen }: { ancho: number; alto: number; objeto: 'mesa' | 'elemento'; id: string; margen: number }) => {
    const r = 9 * unidadesPorPixel;
    const brazo = 26 * unidadesPorPixel;
    const mitadAncho = ancho / 2 + margen;
    const mitadAlto = alto / 2 + margen;
    return (
      <g>
        <rect x={-mitadAncho} y={-mitadAlto} width={mitadAncho * 2} height={mitadAlto * 2} fill="none" stroke="#f59e0b" strokeWidth={2 * unidadesPorPixel} strokeDasharray={`${6 * unidadesPorPixel} ${4 * unidadesPorPixel}`} rx={4} style={{ pointerEvents: 'none' }} />
        <line x1={0} y1={-mitadAlto} x2={0} y2={-mitadAlto - brazo} stroke="#f59e0b" strokeWidth={2 * unidadesPorPixel} style={{ pointerEvents: 'none' }} />
        <circle data-plano="rotar" data-objeto={objeto} data-id={id} cx={0} cy={-mitadAlto - brazo} r={r} fill="#ffffff" stroke="#f59e0b" strokeWidth={2.5 * unidadesPorPixel} style={{ cursor: 'grab' }}>
          <title>Girar</title>
        </circle>
        <rect data-plano="medida" data-objeto={objeto} data-id={id} x={mitadAncho - r} y={mitadAlto - r} width={r * 2} height={r * 2} rx={3 * unidadesPorPixel} fill="#f59e0b" stroke="#ffffff" strokeWidth={2 * unidadesPorPixel} style={{ cursor: 'nwse-resize' }}>
          <title>Cambiar tamaño</title>
        </rect>
      </g>
    );
  };

  const hoverMesa = hover ? mesas.find(m => m.id === hover.id) : undefined;
  const contenidoTooltip = hoverMesa && tooltip ? tooltip(hoverMesa.id) : null;
  const tooltipALaIzquierda = hover ? hover.x > tamanio.ancho - 240 : false;

  return (
    <div
      ref={contenedor}
      className={`relative w-full overflow-hidden rounded-2xl ${estatico ? '' : 'border border-slate-200 bg-slate-50'}`}
      style={{ aspectRatio: `${plano.ancho} / ${plano.alto}`, maxHeight: altoMaximo, minHeight: estatico ? undefined : 260 }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full select-none"
        style={{
          touchAction: estatico ? 'auto' : editando || vista.zoom > 1 ? 'none' : 'pan-y',
          pointerEvents: estatico ? 'none' : undefined,
          cursor: editando ? 'default' : vista.zoom > 1 ? 'grab' : 'default',
        }}
        onPointerDown={alApretar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        role={estatico ? 'img' : 'application'}
        aria-label="Plano de mesas"
      >
        <defs>
          <pattern id={`grilla-${idPatron}`} width={grilla || 20} height={grilla || 20} patternUnits="userSpaceOnUse">
            <path d={`M ${grilla || 20} 0 L 0 0 0 ${grilla || 20}`} fill="none" stroke="#e2e8f0" strokeWidth={1} />
          </pattern>
          <filter id={`sombra-${idPatron}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Piso */}
        <rect x={0} y={0} width={plano.ancho} height={plano.alto} fill="#fdfcfa" />
        {editando && grilla > 0 && <rect x={0} y={0} width={plano.ancho} height={plano.alto} fill={`url(#grilla-${idPatron})`} style={{ pointerEvents: 'none' }} />}

        {/* Elementos de referencia: abajo de las mesas y sin eventos fuera del editor. */}
        <g style={{ pointerEvents: editando ? 'auto' : 'none' }}>
          {plano.elementos.map(elemento => (
            <g
              key={elemento.id}
              data-plano="elemento"
              data-id={elemento.id}
              transform={`translate(${elemento.x} ${elemento.y}) rotate(${elemento.rotacion || 0})`}
              style={{ cursor: editando ? 'move' : undefined }}
            >
              <DibujoElemento elemento={elemento} />
              {editando && seleccionada('elemento', elemento.id) && (
                manijas({ ancho: elemento.ancho, alto: elemento.alto, objeto: 'elemento', id: elemento.id, margen: 4 })
              )}
            </g>
          ))}
        </g>

        {mesas.map(mesa => {
          const margen = margenSillas(mesa.layout);
          const config = estadoMesaConfig[mesa.estado];
          const activa = seleccionada('mesa', mesa.id);
          return (
            <g
              key={mesa.id}
              data-plano="mesa"
              data-id={mesa.id}
              transform={`translate(${mesa.layout.x} ${mesa.layout.y}) rotate(${mesa.layout.rotacion || 0})`}
              style={{ cursor: editando ? 'move' : 'pointer', outline: 'none' }}
              tabIndex={estatico ? undefined : 0}
              role={estatico ? undefined : 'button'}
              aria-label={`${mesa.nombreCompleto}: ${config.label}`}
              onKeyDown={evento => {
                if (editando || (evento.key !== 'Enter' && evento.key !== ' ')) return;
                evento.preventDefault();
                onTocarMesa?.(mesa.id);
              }}
              filter={estatico ? undefined : `url(#sombra-${idPatron})`}
              className="plano-mesa"
            >
              {/* Zona de toque más grande que el dibujo, con las sillas incluidas. */}
              <rect
                x={-mesa.layout.ancho / 2 - margen - 6}
                y={-mesa.layout.alto / 2 - margen - 6}
                width={mesa.layout.ancho + (margen + 6) * 2}
                height={mesa.layout.alto + (margen + 6) * 2}
                fill="transparent"
              />
              <DibujoMesa
                layout={mesa.layout}
                etiqueta={mesa.etiqueta}
                capacidad={mesa.capacidad}
                colores={config.colores}
                minutos={mesa.minutos}
              />
              {editando && activa && manijas({ ancho: mesa.layout.ancho, alto: mesa.layout.alto, objeto: 'mesa', id: mesa.id, margen })}
            </g>
          );
        })}

        {/* Marco del plano */}
        <rect x={0} y={0} width={plano.ancho} height={plano.alto} fill="none" stroke="#e2e8f0" strokeWidth={2} style={{ pointerEvents: 'none' }} />
      </svg>

      {!estatico && (
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm">
          <button type="button" onClick={() => zoomEn(1.3)} className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50" aria-label="Acercar">
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => zoomEn(1 / 1.3)} disabled={vista.zoom <= 1} className="flex h-10 w-10 items-center justify-center border-t border-slate-100 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Alejar">
            <Minus size={16} />
          </button>
          <button type="button" onClick={() => setVista({ zoom: 1, cx: plano.ancho / 2, cy: plano.alto / 2 })} disabled={vista.zoom <= 1} className="flex h-10 w-10 items-center justify-center border-t border-slate-100 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Ver el plano entero">
            <Maximize2 size={15} />
          </button>
        </div>
      )}

      {hover && contenidoTooltip && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
          style={{
            left: tooltipALaIzquierda ? undefined : hover.x + 16,
            right: tooltipALaIzquierda ? tamanio.ancho - hover.x + 16 : undefined,
            top: Math.min(hover.y + 16, Math.max(0, tamanio.alto - 150)),
          }}
        >
          {contenidoTooltip}
        </div>
      )}
    </div>
  );
}
