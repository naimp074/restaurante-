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
  facturas: caja,
  productos: gestion,
  combos: gestion,
  cartas: gestion,
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

type PerfilPaginas = { rol: Rol; paginas?: PageId[] | null };

/** Lo que el admin puede tildar por cuenta. Cada una abarca todos sus apartados. */
export const pantallasElegibles: { label: string; paginas: PageId[]; roles?: Rol[] }[] = [
  { label: 'Dashboard', paginas: ['dashboard'] },
  { label: 'Distribución de mesas', paginas: ['mesas'] },
  { label: 'Comandas', paginas: ['ventas', 'pedidos'] },
  { label: 'Cocina', paginas: ['cocina'] },
  { label: 'Cobros', paginas: ['cobros'] },
  { label: 'Caja y arqueos', paginas: ['caja', 'caja_dia', 'caja_arqueos'] },
  { label: 'Pedidos', paginas: ['pedidos_delivery'] },
  { label: 'Cuenta corriente', paginas: ['cuenta_corriente'] },
  // Supabase solo le muestra los comprobantes a estos roles.
  { label: 'Facturas', paginas: ['facturas'], roles: caja },
  { label: 'Productos y combos', paginas: ['productos', 'combos', 'cartas', 'lista_precios', 'diferentes_listas'] },
  { label: 'Stock', paginas: ['stock', 'stock_insumos', 'stock_consumos', 'stock_produccion'] },
  { label: 'Proveedores', paginas: ['proveedores'] },
  { label: 'Gastos', paginas: ['gastos', 'gastos_pagos', 'gastos_traspasos'] },
  { label: 'Costos y recetas', paginas: ['costos'] },
  { label: 'Reportes', paginas: ['reportes'] },
  { label: 'Configuración', paginas: ['configuracion'] },
];

export const pantallasDelRol = (rol: Rol) => pantallasElegibles.filter(p => !p.roles || p.roles.includes(rol));

export const paginasPorDefecto = (rol: Rol): PageId[] =>
  pantallasDelRol(rol).flatMap(p => p.paginas).filter(pagina => puedeVerPagina(rol, pagina));

/** El admin siempre ve todo, así nadie se queda afuera de Usuarios. */
export const perfilVePagina = ({ rol, paginas }: PerfilPaginas, pagina: PageId) => {
  if (rol === 'admin' || !paginas) return puedeVerPagina(rol, pagina);
  return pagina !== 'usuarios' && paginas.includes(pagina);
};

export const paginaInicialDe = (perfil: PerfilPaginas): PageId => {
  const inicial = paginaInicial(perfil.rol);
  return perfilVePagina(perfil, inicial) ? inicial : perfil.paginas?.[0] ?? inicial;
};

/** La página actual vive en la dirección (#/caja_dia): recargar no vuelve al inicio y "atrás" funciona. */
export const paginaDesdeHash = (hash: string): PageId | null => {
  const id = hash.replace(/^#\/?/, '');
  // hasOwnProperty y no "in": '#/constructor' no es una pantalla.
  return Object.prototype.hasOwnProperty.call(rolesPorPagina, id) ? (id as PageId) : null;
};

export const hashDePagina = (pagina: PageId) => `#/${pagina}`;
