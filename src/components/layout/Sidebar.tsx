import { useState } from 'react';
import {
  LayoutDashboard, UtensilsCrossed, ClipboardList, ChefHat,
  CreditCard, Package, Boxes, Calculator, BarChart3, Users,
  Settings, LogOut, Truck, PanelLeftClose, PanelLeftOpen, ReceiptText,
  ChevronDown, Grid3X3, Tags, X
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
  { id: 'ventas', label: 'Ventas', icon: ClipboardList, roles: ['admin', 'encargado', 'moza', 'cajero', 'cocina'] },
  { id: 'stock', label: 'Stock', icon: Boxes, roles: ['admin', 'encargado'] },
  { id: 'productos', label: 'Productos', icon: Package, roles: ['admin', 'encargado'] },
  { id: 'proveedores', label: 'Proveedores', icon: Truck, roles: ['admin', 'encargado'] },
  { id: 'gastos', label: 'Gastos', icon: ReceiptText, roles: ['admin', 'encargado'] },
  { id: 'costos', label: 'Costos y Recetas', icon: Calculator, roles: ['admin', 'encargado'] },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, roles: ['admin', 'encargado'] },
  { id: 'usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
];

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle, mobileOpen, onClose }: SidebarProps) {
  const { user, signOut, hasRole } = useAuth();
  const [showVentasMenu, setShowVentasMenu] = useState(false);
  const [showCajaMenu, setShowCajaMenu] = useState(false);
  const [showProductosMenu, setShowProductosMenu] = useState(false);
  const [showStockMenu, setShowStockMenu] = useState(false);

  const compact = collapsed && !mobileOpen;
  const visibleItems = navItems.filter(item => hasRole(...item.roles));
  const ventasActive = currentPage === 'ventas' || currentPage === 'mesas' || currentPage === 'caja' || currentPage === 'caja_dia' || currentPage === 'caja_arqueos' || currentPage === 'cobros' || currentPage === 'cocina' || currentPage === 'pedidos';
  const productosActive = currentPage === 'productos' || currentPage === 'combos' || currentPage === 'lista_precios';
  const stockActive = currentPage === 'stock' || currentPage === 'stock_insumos' || currentPage === 'stock_consumos' || currentPage === 'stock_produccion';

  return (
    <aside
      className={`flex flex-col bg-slate-900 text-white h-dvh flex-shrink-0 lg:sticky lg:top-0 transition-all duration-300 pb-[env(safe-area-inset-bottom)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-72 max-lg:shadow-2xl ${
        mobileOpen ? 'max-lg:translate-x-0 max-lg:pointer-events-auto' : 'max-lg:-translate-x-full max-lg:pointer-events-none max-lg:invisible'
      } ${compact ? 'lg:w-20' : 'lg:w-64'}`}
    >
      <div className={`flex items-center border-b border-slate-700/50 py-4 ${compact ? 'px-3 justify-center' : 'px-5'}`}>
        <div className={`flex items-center gap-2 min-w-0 ${compact ? 'justify-center' : 'flex-1'}`}>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed size={16} className="text-white" />
          </div>
          {!compact && (
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight truncate">BurgerPOS</p>
            <p className="text-slate-400 text-xs truncate">Sistema de Gestión</p>
          </div>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-1">
            <button
              onClick={onToggle}
              className="hidden lg:flex w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white items-center justify-center transition-colors"
              title="Reducir menú"
            >
              <PanelLeftClose size={16} />
            </button>
            <button
              onClick={onClose}
              className="lg:hidden w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white flex items-center justify-center transition-colors"
              title="Cerrar menú"
              aria-label="Cerrar menú"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {compact && (
        <button
          onClick={onToggle}
          className="hidden lg:flex mx-auto mt-3 w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white items-center justify-center transition-colors"
          title="Expandir menú"
        >
          <PanelLeftOpen size={17} />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isVentas = item.id === 'ventas';
          const isProductos = item.id === 'productos';
          const isStock = item.id === 'stock';
          const isActive = isVentas ? ventasActive : isProductos ? productosActive : isStock ? stockActive : currentPage === item.id;

          if (isVentas) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (compact) {
                      onNavigate('ventas');
                      return;
                    }
                    setShowVentasMenu(prev => !prev);
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative py-2.5 ${
                    compact ? 'justify-center px-2' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={compact ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!compact && <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>}
                  {!compact && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showVentasMenu ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {!compact && showVentasMenu && (
                  <div className="ml-6 mt-1 space-y-0.5 rounded-xl bg-slate-800/60 p-1">
                    {hasRole('admin', 'encargado', 'moza', 'cajero') && (
                      <button
                        onClick={() => onNavigate('mesas')}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          currentPage === 'mesas' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <UtensilsCrossed size={13} />
                        Mesas
                      </button>
                    )}
                    {hasRole('admin', 'encargado', 'cajero') && (
                      <div>
                        <button
                          onClick={() => setShowCajaMenu(prev => !prev)}
                          className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                            currentPage === 'caja' || currentPage === 'caja_dia' || currentPage === 'caja_arqueos'
                              ? 'bg-amber-500 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <Calculator size={13} />
                          <span className="flex-1">Caja</span>
                          <ChevronDown size={12} className={`transition-transform ${showCajaMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showCajaMenu && (
                          <div className="ml-5 mt-1 space-y-0.5">
                            <button
                              onClick={() => onNavigate('caja_dia')}
                              className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                                currentPage === 'caja' || currentPage === 'caja_dia' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              Caja del día
                            </button>
                            <button
                              onClick={() => onNavigate('caja_arqueos')}
                              className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                                currentPage === 'caja_arqueos' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              Arqueos
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {hasRole('admin', 'encargado', 'cajero') && (
                      <button
                        onClick={() => onNavigate('cobros')}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          currentPage === 'cobros' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <CreditCard size={13} />
                        Cobros
                      </button>
                    )}
                    {hasRole('admin', 'encargado', 'moza', 'cajero') && (
                      <button
                        onClick={() => onNavigate('ventas')}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          currentPage === 'ventas' || currentPage === 'pedidos' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <ClipboardList size={13} />
                        Comandas
                      </button>
                    )}
                    {hasRole('admin', 'encargado', 'cocina') && (
                      <button
                        onClick={() => onNavigate('cocina')}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          currentPage === 'cocina' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <ChefHat size={13} />
                        Cocina
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          if (isProductos) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (compact) {
                      onNavigate('combos');
                      return;
                    }
                    setShowProductosMenu(prev => !prev);
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative py-2.5 ${
                    compact ? 'justify-center px-2' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={compact ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!compact && <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>}
                  {!compact && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showProductosMenu ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {!compact && showProductosMenu && (
                  <div className="ml-6 mt-1 space-y-0.5 rounded-xl bg-slate-800/60 p-1">
                    <button
                      onClick={() => onNavigate('combos')}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        currentPage === 'combos' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Grid3X3 size={13} />
                      Combos
                    </button>
                    <button
                      onClick={() => onNavigate('lista_precios')}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        currentPage === 'lista_precios' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Tags size={13} />
                      Lista de precio
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (isStock) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (compact) {
                      onNavigate('stock_insumos');
                      return;
                    }
                    setShowStockMenu(prev => !prev);
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative py-2.5 ${
                    compact ? 'justify-center px-2' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={compact ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!compact && <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>}
                  {!compact && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showStockMenu ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {!compact && showStockMenu && (
                  <div className="ml-6 mt-1 space-y-0.5 rounded-xl bg-slate-800/60 p-1">
                    <button
                      onClick={() => onNavigate('stock_insumos')}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        currentPage === 'stock_insumos' || currentPage === 'stock' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Boxes size={13} />
                      Stock
                    </button>
                    <button
                      onClick={() => onNavigate('stock_consumos')}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        currentPage === 'stock_consumos' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <ReceiptText size={13} />
                      Consumos internos
                    </button>
                    <button
                      onClick={() => onNavigate('stock_produccion')}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        currentPage === 'stock_produccion' ? 'bg-amber-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <ChefHat size={13} />
                      Producción
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative py-2.5 ${
                compact ? 'justify-center px-2' : 'px-3'
              } ${
                isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              title={compact ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!compact && <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>}
              {!compact && item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className={`border-t border-slate-700/50 p-2 space-y-0.5`}>
        <button
          onClick={() => onNavigate('configuracion')}
          className={`w-full flex items-center gap-3 rounded-lg py-2.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors ${
            compact ? 'justify-center px-2' : 'px-3'
          }`}
          title={compact ? 'Configuración' : undefined}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!compact && <span className="text-sm font-medium">Configuración</span>}
        </button>

        <div className={`flex items-center gap-3 py-2 rounded-lg ${compact ? 'justify-center px-2' : 'px-3'}`}>
          {!compact && (
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
