import type { PageId, Rol } from './types';

const gestion: Rol[] = ['admin', 'encargado'];
const caja: Rol[] = ['admin', 'encargado', 'cajero'];

/**
 * Quién puede abrir cada pantalla. El menú ya oculta lo que no corresponde, pero sin
 * este control se podía entrar igual escribiendo la dirección.
 */
export const rolesPorPagina: Record<PageId, Rol[]> = {
  dashboard: caja,
  ventas: ['admin', 'encargado', 'moza', 'cajero'],
  pedidos: ['admin', 'encargado', 'moza', 'cajero'],
  pedidos_delivery: ['admin', 'encargado', 'moza', 'cajero'],
  mesas: ['admin', 'encargado', 'moza', 'cajero'],
  cocina: ['admin', 'encargado', 'cocina'],
  caja,
  caja_dia: caja,
  caja_arqueos: caja,
  cobros: caja,
  cuenta_corriente: caja,
  productos: gestion,
  combos: gestion,
  lista_precios: gestion,
  diferentes_listas: gestion,
  stock: gestion,
  stock_insumos: gestion,
  stock_consumos: gestion,
  stock_produccion: gestion,
  proveedores: gestion,
  gastos: gestion,
  gastos_pagos: gestion,
  gastos_traspasos: gestion,
  costos: gestion,
  reportes: gestion,
  usuarios: ['admin'],
  configuracion: gestion,
};

export const puedeVerPagina = (rol: Rol, pagina: PageId) => rolesPorPagina[pagina].includes(rol);

export const paginaInicial = (rol: Rol): PageId => {
  if (rol === 'moza') return 'ventas';
  if (rol === 'cocina') return 'cocina';
  if (rol === 'cajero') return 'caja';
  return 'dashboard';
};

/** La página actual vive en la dirección (#/caja_dia): recargar no vuelve al inicio y "atrás" funciona. */
export const paginaDesdeHash = (hash: string): PageId | null => {
  const id = hash.replace(/^#\/?/, '');
  // hasOwnProperty y no "in": '#/constructor' no es una pantalla.
  return Object.prototype.hasOwnProperty.call(rolesPorPagina, id) ? (id as PageId) : null;
};

export const hashDePagina = (pagina: PageId) => `#/${pagina}`;
