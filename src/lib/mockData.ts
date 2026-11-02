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
  { id: 's-cafeteria', nombre: 'S-CAFETERÍA', descripcion: 'Cafetería', icono: 'coffee', color: '#92400e', orden: 1, activa: true, created_at: '' },
  { id: 's-bar', nombre: 'S-BAR', descripcion: 'Bar', icono: 'glass-water', color: '#3b82f6', orden: 2, activa: true, created_at: '' },
  { id: 's-restaurante', nombre: 'S-RESTAURANTE', descripcion: 'Restaurante', icono: 'sandwich', color: '#ef4444', orden: 3, activa: true, created_at: '' },
];
