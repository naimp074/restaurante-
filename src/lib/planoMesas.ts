import type { ElementoPlano, FormaMesa, Mesa, PlanoMesa, PlanoSector, TipoElementoPlano } from './types';

/**
 * Geometría de los planos. Todo está en unidades del plano (el viewBox del SVG): el dibujo
 * escala entero, así que una mesa guardada en (300, 200) queda en el mismo lugar en una
 * notebook o en un celular. El zoom solo cambia lo que se mira, nunca estas coordenadas.
 */

export const planoPorDefecto = (): PlanoSector => ({ ancho: 1000, alto: 700, elementos: [] });

export const medidasPorForma: Record<FormaMesa, { ancho: number; alto: number }> = {
  cuadrada: { ancho: 64, alto: 64 },
  rectangular: { ancho: 120, alto: 64 },
  redonda: { ancho: 72, alto: 72 },
  box: { ancho: 160, alto: 96 },
  alta: { ancho: 48, alto: 48 },
};

export const nombresForma: Record<FormaMesa, string> = {
  cuadrada: 'Cuadrada',
  rectangular: 'Rectangular',
  redonda: 'Redonda',
  box: 'Box con sillones',
  alta: 'Alta / barra',
};

export const elementosDisponibles: { tipo: TipoElementoPlano; label: string; ancho: number; alto: number; texto?: string }[] = [
  { tipo: 'pared', label: 'Pared', ancho: 300, alto: 12 },
  { tipo: 'puerta', label: 'Puerta', ancho: 80, alto: 14 },
  { tipo: 'ingreso', label: 'Ingreso', ancho: 140, alto: 26, texto: 'Ingreso' },
  { tipo: 'cocina', label: 'Cocina', ancho: 180, alto: 220, texto: 'Cocina' },
  { tipo: 'bano', label: 'Baño', ancho: 140, alto: 140, texto: 'Baño' },
  { tipo: 'barra', label: 'Barra', ancho: 260, alto: 50, texto: 'Barra' },
  { tipo: 'zona', label: 'Zona', ancho: 240, alto: 160, texto: 'Zona' },
  { tipo: 'etiqueta', label: 'Texto', ancho: 160, alto: 30, texto: 'Texto' },
  { tipo: 'planta', label: 'Planta', ancho: 40, alto: 40 },
];

export const MINIMO_MESA = 28;
export const SILLA_ALTO = 10;
export const SEPARACION_SILLA = 4;

/** Cuánto sobresalen las sillas o sillones del rectángulo de la mesa. */
export const margenSillas = (layout: PlanoMesa) => {
  if (layout.forma === 'box') return 4;
  if (layout.forma === 'redonda') return SILLA_ALTO + SEPARACION_SILLA + 2;
  return SILLA_ALTO + SEPARACION_SILLA;
};
export const MINIMO_ELEMENTO = 8;

export const limitar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

export const ajustarAGrilla = (valor: number, paso: number) => (paso > 0 ? Math.round(valor / paso) * paso : valor);

export const normalizarRotacion = (grados: number) => {
  const resto = Math.round(grados) % 360;
  return resto < 0 ? resto + 360 : resto;
};

/** Mantiene el centro dentro del plano. */
export const dentroDelPlano = <T extends { x: number; y: number }>(item: T, plano: Pick<PlanoSector, 'ancho' | 'alto'>): T => ({
  ...item,
  x: limitar(item.x, 0, plano.ancho),
  y: limitar(item.y, 0, plano.alto),
});

const esNumero = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);

/** Un plano guardado puede venir de otra versión: si le falta algo, se usa lo de fábrica. */
export const planoValido = (plano: Partial<PlanoSector> | undefined | null): PlanoSector => {
  const base = planoPorDefecto();
  if (!plano) return base;
  return {
    ancho: esNumero(plano.ancho) && plano.ancho >= 200 ? plano.ancho : base.ancho,
    alto: esNumero(plano.alto) && plano.alto >= 200 ? plano.alto : base.alto,
    elementos: Array.isArray(plano.elementos)
      ? plano.elementos.filter(el => el && esNumero(el.x) && esNumero(el.y) && esNumero(el.ancho) && esNumero(el.alto))
      : [],
    actualizado_at: plano.actualizado_at,
  };
};

export const layoutValido = (layout: PlanoMesa | undefined): layout is PlanoMesa =>
  Boolean(layout && esNumero(layout.x) && esNumero(layout.y) && esNumero(layout.ancho) && esNumero(layout.alto));

export const layoutNuevo = (forma: FormaMesa, x: number, y: number): PlanoMesa => ({
  x, y, rotacion: 0, forma, ...medidasPorForma[forma],
});

/** Caja que ocupa algo rotado, con sillas incluidas, para no encimar mesas al ubicarlas solas. */
const cajaDe = (item: { x: number; y: number; ancho: number; alto: number; rotacion?: number }, margen = 0) => {
  const rad = ((item.rotacion || 0) * Math.PI) / 180;
  const ancho = Math.abs(item.ancho * Math.cos(rad)) + Math.abs(item.alto * Math.sin(rad)) + margen * 2;
  const alto = Math.abs(item.ancho * Math.sin(rad)) + Math.abs(item.alto * Math.cos(rad)) + margen * 2;
  return { x1: item.x - ancho / 2, y1: item.y - alto / 2, x2: item.x + ancho / 2, y2: item.y + alto / 2 };
};

const seTocan = (a: ReturnType<typeof cajaDe>, b: ReturnType<typeof cajaDe>) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

const porNumero = (a: Mesa, b: Mesa) => a.numero - b.numero || (a.nombre || '').localeCompare(b.nombre || '');

/**
 * Ubica en una grilla las mesas que todavía no tienen lugar, esquivando lo que ya está
 * puesto (otras mesas y los elementos que no son zonas ni textos).
 */
export const ubicarSinLugar = (
  mesas: Mesa[],
  plano: PlanoSector,
  ocupados: { x: number; y: number; ancho: number; alto: number; rotacion?: number }[] = [],
): Map<string, PlanoMesa> => {
  const resultado = new Map<string, PlanoMesa>();
  const celda = 130;
  const margen = 70;
  const columnas = Math.max(1, Math.floor((plano.ancho - margen * 2) / celda) + 1);
  const filas = Math.max(1, Math.floor((plano.alto - margen * 2) / celda) + 1);
  const cajas = ocupados.map(item => cajaDe(item, 22));
  let indice = 0;

  [...mesas].sort(porNumero).forEach(mesa => {
    const forma: FormaMesa = /box/i.test(mesa.nombre || '') ? 'box' : 'cuadrada';
    let layout: PlanoMesa | undefined;
    // Primero busca un hueco libre; si el plano está lleno, sigue la grilla hacia abajo.
    while (!layout) {
      const fila = Math.floor(indice / columnas);
      const columna = indice % columnas;
      const candidato = layoutNuevo(forma, margen + columna * celda, margen + fila * celda);
      indice += 1;
      const caja = cajaDe(candidato, 22);
      if (fila >= filas || !cajas.some(otra => seTocan(caja, otra))) {
        layout = fila >= filas ? dentroDelPlano(candidato, plano) : candidato;
        cajas.push(caja);
      }
    }
    resultado.set(mesa.id, layout);
  });
  return resultado;
};

const obstaculos = (plano: PlanoSector) =>
  plano.elementos.filter(el => el.tipo !== 'zona' && el.tipo !== 'etiqueta');

/** Dónde se dibuja cada mesa del apartado: lo guardado o, si no tiene, un lugar libre. */
export const layoutsDelSector = (mesas: Mesa[], plano: PlanoSector): Map<string, PlanoMesa> => {
  const ubicadas = mesas.filter(mesa => layoutValido(mesa.plano));
  const sinLugar = mesas.filter(mesa => !layoutValido(mesa.plano));
  const layouts = new Map<string, PlanoMesa>(ubicadas.map(mesa => [mesa.id, mesa.plano as PlanoMesa]));
  ubicarSinLugar(sinLugar, plano, [...ubicadas.map(mesa => mesa.plano as PlanoMesa), ...obstaculos(plano)])
    .forEach((layout, id) => layouts.set(id, layout));
  return layouts;
};

/** Reorganizar: todas las mesas en grilla, por número, respetando paredes y cocina. */
export const reorganizarEnGrilla = (mesas: Mesa[], plano: PlanoSector) => ubicarSinLugar(mesas, plano, obstaculos(plano));

export const mismoLayout = (a: PlanoMesa | undefined, b: PlanoMesa | undefined) =>
  Boolean(a && b) &&
  a!.forma === b!.forma &&
  [a!.x - b!.x, a!.y - b!.y, a!.ancho - b!.ancho, a!.alto - b!.alto, a!.rotacion - b!.rotacion].every(d => Math.abs(d) < 0.01);

/** Mueve un punto a los ejes propios de algo rotado (para agrandar desde la esquina). */
export const aEjesLocales = (dx: number, dy: number, rotacion: number) => {
  const rad = (-rotacion * Math.PI) / 180;
  return { dx: dx * Math.cos(rad) - dy * Math.sin(rad), dy: dx * Math.sin(rad) + dy * Math.cos(rad) };
};

export const etiquetaMesa = (mesa: Pick<Mesa, 'numero' | 'nombre'>) => {
  const nombre = mesa.nombre?.trim();
  return nombre && nombre.length <= 7 ? nombre : String(mesa.numero);
};

/* ------------------------------------------------------------------------------------------ */
/* Plantillas: un plano de referencia que ubica las mesas que ya existen según su número.     */
/* ------------------------------------------------------------------------------------------ */

export type MesaPlantilla = PlanoMesa & {
  /** Número de la mesa o, para las que no tienen número propio (Box 1), su nombre. */
  ref: number | string;
  capacidad?: number;
};

export interface PlantillaPlano {
  id: string;
  nombre: string;
  descripcion: string;
  ancho: number;
  alto: number;
  elementos: Omit<ElementoPlano, 'id'>[];
  mesas: MesaPlantilla[];
}

const normalizar = (texto: string) =>
  texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const coincide = (mesa: Mesa, ref: number | string) =>
  typeof ref === 'number' ? mesa.numero === ref : normalizar(mesa.nombre || '') === normalizar(ref);

export interface AnalisisPlantilla {
  /** Mesas del apartado que la plantilla ubica. */
  enSector: { mesa: Mesa; layout: PlanoMesa }[];
  /** Mesas que la plantilla nombra pero hoy están en otro apartado. */
  enOtroSector: { mesa: Mesa; layout: PlanoMesa }[];
  /** Números que la plantilla dibuja y no existen en el sistema. */
  faltantes: MesaPlantilla[];
  /** Mesas del apartado que la plantilla no nombra: se ubican en un hueco libre. */
  sobrantes: Mesa[];
}

export const analizarPlantilla = (plantilla: PlantillaPlano, sectorId: string, mesas: Mesa[]): AnalisisPlantilla => {
  const usadas = new Set<string>();
  const analisis: AnalisisPlantilla = { enSector: [], enOtroSector: [], faltantes: [], sobrantes: [] };

  plantilla.mesas.forEach(({ ref, capacidad: _capacidad, ...layout }) => {
    const candidatas = mesas.filter(mesa => !usadas.has(mesa.id) && coincide(mesa, ref));
    // Si el número se repite en dos apartados, gana la del apartado que se está armando.
    const mesa = candidatas.find(m => m.sector === sectorId) ?? candidatas[0];
    if (!mesa) {
      analisis.faltantes.push({ ref, capacidad: _capacidad, ...layout });
      return;
    }
    usadas.add(mesa.id);
    (mesa.sector === sectorId ? analisis.enSector : analisis.enOtroSector).push({ mesa, layout });
  });

  analisis.sobrantes = mesas.filter(mesa => mesa.sector === sectorId && !usadas.has(mesa.id));
  return analisis;
};

export const elementosDePlantilla = (plantilla: PlantillaPlano, crearId: () => string): ElementoPlano[] =>
  plantilla.elementos.map(elemento => ({ ...elemento, id: crearId() }));
