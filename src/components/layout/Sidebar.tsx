import {
  LayoutDashboard, UtensilsCrossed, ClipboardList, ChefHat,
  CreditCard, Package, Boxes, Calculator, BarChart3, Users,
  Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import type { PageId, Rol } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  roles: Rol[];
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'encargado', 'cajero'] },
  { id: 'mesas', label: 'Mesas', icon: UtensilsCrossed, roles: ['admin', 'encargado', 'moza', 'cajero'] },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList, roles: ['admin', 'encargado', 'moza', 'cajero'] },
  { id: 'cocina', label: 'Cocina', icon: ChefHat, roles: ['admin', 'encargado', 'cocina'] },
  { id: 'caja', label: 'Caja', icon: CreditCard, roles: ['admin', 'encargado', 'cajero'] },
  { id: 'productos', label: 'Productos', icon: Package, roles: ['admin', 'encargado'] },
  { id: 'stock', label: 'Stock', icon: Boxes, roles: ['admin', 'encargado'] },
  { id: 'costos', label: 'Costos y Recetas', icon: Calculator, roles: ['admin', 'encargado'] },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, roles: ['admin', 'encargado'] },
  { id: 'usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
];

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { user, signOut, hasRole } = useAuth();

  const visibleItems = navItems.filter(item => hasRole(...item.roles));

  return (
    <aside
      className={`flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out h-screen sticky top-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className={`flex items-center border-b border-slate-700/50 ${collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-4'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm leading-tight truncate">BurgerPOS</p>
              <p className="text-slate-400 text-xs truncate">Sistema de Gestión</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <UtensilsCrossed size={16} className="text-white" />
          </div>
        )}
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center hover:bg-amber-500 transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative ${
                collapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>
              )}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      <div className={`border-t border-slate-700/50 p-2 space-y-0.5`}>
        <button
          onClick={() => onNavigate('configuracion')}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
          title={collapsed ? 'Configuración' : undefined}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Configuración</span>}
        </button>

        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${collapsed ? 'justify-center px-2' : ''}`}>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.nombre} {user?.apellido}</p>
              <p className="text-xs text-slate-400 capitalize truncate">{user?.rol}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors flex-shrink-0"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
