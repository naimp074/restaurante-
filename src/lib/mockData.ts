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
  { id: 'cat-1', nombre: 'Desayunos y meriendas', descripcion: 'Desayunos y meriendas', icono: 'coffee', color: '#f59e0b', orden: 1, activa: true, created_at: '' },
  { id: 'cat-2', nombre: 'Cafetería', descripcion: 'Cafés e infusiones', icono: 'coffee', color: '#92400e', orden: 2, activa: true, created_at: '' },
  { id: 'cat-7', nombre: 'Licuados', descripcion: 'Licuados de fruta', icono: 'glass-water', color: '#ec4899', orden: 3, activa: true, created_at: '' },
  { id: 'cat-8', nombre: 'Salados', descripcion: 'Tostados, sándwiches y picadas', icono: 'sandwich', color: '#ef4444', orden: 4, activa: true, created_at: '' },
  { id: 'cat-9', nombre: 'Tostones', descripcion: 'Tostones', icono: 'sandwich', color: '#84cc16', orden: 5, activa: true, created_at: '' },
  { id: 'cat-10', nombre: 'Dulces', descripcion: 'Medialunas, facturas y porciones', icono: 'cake', color: '#d946ef', orden: 6, activa: true, created_at: '' },
  { id: 'cat-3', nombre: 'Bebidas', descripcion: 'Gaseosas y aguas de 500 cc', icono: 'glass-water', color: '#3b82f6', orden: 7, activa: true, created_at: '' },
  { id: 'cat-11', nombre: 'Wafles', descripcion: 'Wafles', icono: 'cake', color: '#eab308', orden: 8, activa: true, created_at: '' },
  { id: 'cat-12', nombre: 'Jugos especiales', descripcion: 'Jugos con un toque especial', icono: 'glass-water', color: '#14b8a6', orden: 9, activa: true, created_at: '' },
  { id: 'cat-13', nombre: 'Jugos naturales', descripcion: 'Jugos naturales y limonadas', icono: 'glass-water', color: '#22c55e', orden: 10, activa: true, created_at: '' },
  { id: 'cat-4', nombre: 'Helados', descripcion: 'Cucurucho o copa', icono: 'cake', color: '#06b6d4', orden: 11, activa: true, created_at: '' },
  { id: 'cat-14', nombre: 'Batidos', descripcion: 'Batidos', icono: 'glass-water', color: '#a855f7', orden: 12, activa: true, created_at: '' },
  { id: 'cat-5', nombre: 'Promos', descripcion: 'Promos para compartir', icono: 'package', color: '#10b981', orden: 13, activa: true, created_at: '' },
  { id: 'cat-6', nombre: 'Agregados', descripcion: 'Agregados y adicionales', icono: 'plus-circle', color: '#6366f1', orden: 14, activa: true, created_at: '' },
];
