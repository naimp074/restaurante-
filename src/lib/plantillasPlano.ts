import type { ElementoPlano, FormaMesa } from './types';
import { medidasPorForma, type MesaPlantilla, type PlantillaPlano } from './planoMesas';

/**
 * Planos de referencia del local. Solo ubican las mesas que ya existen (por número o por
 * nombre, como "Box 1"): no crean ni borran nada salvo que se pida en el editor. Las medidas
 * son aproximadas; lo fino se acomoda arrastrando en "Editar plano".
 */

const M = medidasPorForma.cuadrada.ancho; // lado de una mesa de dos/cuatro

const mesa = (ref: number | string, x: number, y: number, forma: FormaMesa = 'cuadrada', extra: Partial<MesaPlantilla> = {}): MesaPlantilla => ({
  ref, x, y, rotacion: 0, forma, ...medidasPorForma[forma], ...extra,
});

/** Dos mesas pegadas de costado: se dibujan juntas pero cada una tiene su estado. */
const par = (izquierda: number, derecha: number, centroX: number, y: number): MesaPlantilla[] => [
  mesa(izquierda, centroX - M / 2, y),
  mesa(derecha, centroX + M / 2, y),
];

type SinId = Omit<ElementoPlano, 'id'>;
const el = (tipo: ElementoPlano['tipo'], x: number, y: number, ancho: number, alto: number, extra: Partial<SinId> = {}): SinId => ({
  tipo, x, y, ancho, alto, rotacion: 0, ...extra,
});

/* Salón principal: ingreso arriba al centro, cocina a la derecha, baño abajo a la derecha. */
const salon: PlantillaPlano = {
  id: 'salon-principal',
  nombre: 'Salón principal',
  descripcion: 'Mesas 1 a 25, Box 1 y Box 2, con ingreso, cocina y baño.',
  ancho: 1000,
  alto: 820,
  elementos: [
    el('pared', 215, 6, 430, 12),
    el('ingreso', 500, 12, 140, 26, { texto: 'Ingreso' }),
    el('pared', 785, 6, 430, 12),
    el('pared', 6, 410, 12, 820),
    el('pared', 994, 410, 12, 820),
    el('pared', 500, 814, 1000, 12),
    el('cocina', 928, 232, 132, 440, { texto: 'Cocina' }),
    el('puerta', 862, 400, 70, 14, { rotacion: 90 }),
    el('bano', 928, 702, 132, 212, { texto: 'Baño' }),
    el('puerta', 862, 640, 60, 14, { rotacion: 90 }),
    el('zona', 500, 410, 70, 560, { texto: 'Circulación' }),
  ],
  mesas: [
    // Primera fila, junto al ingreso
    ...par(17, 18, 160, 110),
    mesa(19, 330, 110),
    ...par(24, 25, 700, 110),
    // Segunda fila
    ...par(13, 14, 160, 235),
    ...par(15, 16, 330, 235),
    ...par(22, 23, 700, 235),
    // Tercera fila
    ...par(9, 10, 160, 360),
    ...par(11, 12, 330, 360),
    ...par(20, 21, 700, 360),
    // Cuarta fila
    ...par(5, 6, 160, 485),
    ...par(7, 8, 330, 485),
    // Quinta fila
    ...par(1, 2, 160, 610),
    ...par(3, 4, 330, 610),
    // Boxes contra la pared de abajo
    mesa('Box 1', 175, 740, 'box', { capacidad: 6 }),
    mesa('Box 2', 420, 740, 'box', { capacidad: 6 }),
  ],
};

/* Vereda: pares a la izquierda, mesas solas una debajo de otra a la derecha. */
const vereda: PlantillaPlano = {
  id: 'vereda',
  nombre: 'Vereda',
  descripcion: 'Mesas 50 a 64: cuatro pares a la izquierda y siete mesas en columna a la derecha.',
  ancho: 640,
  alto: 1000,
  elementos: [
    el('pared', 634, 500, 12, 1000),
    el('etiqueta', 600, 500, 260, 26, { texto: 'Fachada del local', rotacion: 90 }),
    el('zona', 28, 500, 44, 1000, { texto: 'Calle', rotacion: 0 }),
  ],
  mesas: [
    ...par(61, 62, 200, 110),
    ...par(58, 59, 200, 360),
    ...par(53, 54, 200, 610),
    ...par(50, 51, 200, 860),
    mesa(64, 470, 80),
    mesa(63, 470, 215),
    mesa(60, 470, 350),
    mesa(57, 470, 485),
    mesa(56, 470, 620),
    mesa(55, 470, 755),
    mesa(52, 470, 890),
  ],
};

/* Sector de las mesas 31 a 43, con la pared en diagonal donde está el ingreso. */
const DIAGONAL = Math.hypot(180, 180);
const sector31: PlantillaPlano = {
  id: 'sector-31-43',
  nombre: 'Sector mesas 31 a 43',
  descripcion: 'Mesas 31 a 43 con la pared diagonal del ingreso.',
  ancho: 1000,
  alto: 700,
  elementos: [
    el('pared', 500, 6, 1000, 12),
    el('pared', 6, 350, 12, 700),
    el('pared', 994, 260, 12, 520),
    el('pared', 410, 694, 820, 12),
    el('pared', 910, 610, DIAGONAL, 12, { rotacion: -45 }),
    el('ingreso', 910, 610, 120, 26, { rotacion: -45, texto: 'Ingreso' }),
  ],
  mesas: [
    ...par(31, 32, 150, 130),
    mesa(33, 330, 130),
    ...par(34, 35, 520, 130),
    mesa(36, 760, 130),
    ...par(37, 38, 150, 360),
    ...par(39, 40, 420, 360),
    ...par(41, 42, 690, 360),
    mesa(43, 760, 540),
  ],
};

export const plantillasPlano: PlantillaPlano[] = [salon, vereda, sector31];
