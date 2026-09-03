import type { CategoriaProducto, Profile } from './types';

/** Perfil usado solo por el acceso rápido cuando Supabase no está configurado. */
export const mockProfile: Profile = {
  id: 'demo-admin-id',
  nombre: 'Demo',
  apellido: 'Administrador',
  rol: 'admin',
  activo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Categorías base para poder clasificar productos desde el primer día. */
export const categoriasIniciales: CategoriaProducto[] = [
  { id: 'cat-1', nombre: 'Hamburguesas', descripcion: 'Hamburguesas clásicas y especiales', icono: 'beef', color: '#ef4444', orden: 1, activa: true, created_at: '' },
  { id: 'cat-2', nombre: 'Papas', descripcion: 'Papas fritas y al horno', icono: 'wheat', color: '#f59e0b', orden: 2, activa: true, created_at: '' },
  { id: 'cat-3', nombre: 'Bebidas', descripcion: 'Gaseosas, jugos y aguas', icono: 'glass-water', color: '#3b82f6', orden: 3, activa: true, created_at: '' },
  { id: 'cat-4', nombre: 'Postres', descripcion: 'Helados y tortas', icono: 'cake', color: '#ec4899', orden: 4, activa: true, created_at: '' },
  { id: 'cat-5', nombre: 'Combos', descripcion: 'Combos completos con bebida', icono: 'package', color: '#10b981', orden: 5, activa: true, created_at: '' },
  { id: 'cat-6', nombre: 'Extras', descripcion: 'Adicionales y salsas', icono: 'plus-circle', color: '#6366f1', orden: 6, activa: true, created_at: '' },
];
