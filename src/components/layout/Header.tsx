import { Bell, Search, Clock, Menu } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { PageId } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useEstadoSync } from '../../lib/sync/useEstadoSync';

const pageTitles: Record<PageId, string> = {
  dashboard: 'Dashboard',
  mesas: 'Gestión de Mesas',
  pedidos: 'Comandas',
  cocina: 'Pantalla de Cocina',
  caja: 'Caja',
  caja_dia: 'Caja del Día',
  caja_arqueos: 'Arqueos',
  cobros: 'Cobros',
  cuenta_corriente: 'Cuenta corriente',
  ventas: 'Comandas',
  productos: 'Productos',
  combos: 'Combos',
  lista_precios: 'Lista de Precio',
  diferentes_listas: 'Diferentes Listas',
  stock: 'Stock e Insumos',
  stock_insumos: 'Stock',
  stock_consumos: 'Consumos Internos',
  stock_produccion: 'Producción',
  proveedores: 'Proveedores',
  gastos: 'Gastos',
  costos: 'Costos y Recetas',
  reportes: 'Reportes y Estadísticas',
  usuarios: 'Gestión de Usuarios',
  configuracion: 'Configuración',
};

interface HeaderProps {
  currentPage: PageId;
  onMenuClick: () => void;
}

export default function Header({ currentPage, onMenuClick }: HeaderProps) {
  const { user, modoDemo } = useAuth();
  const sync = useEstadoSync();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sticky top-0 z-20 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-700 flex-shrink-0"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">{pageTitles[currentPage]}</h1>
          <p className="text-xs text-slate-500 capitalize hidden sm:block truncate">{formatDate(time)}</p>
        </div>
      </div>

      {!modoDemo && !sync.online && (
        <p className="hidden sm:block text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 max-w-[220px]">
          Sin conexión, se guarda acá hasta sincronizar
        </p>
      )}
      {!modoDemo && sync.online && sync.pendiente > 0 && (
        <p className="hidden sm:block text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          Sincronizando cambios…
        </p>
      )}

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <div className="hidden md:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-transparent outline-none w-40 text-sm placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-700">
          <Clock size={14} />
          <span className="font-mono font-semibold">{formatTime(time)}</span>
        </div>

        <button className="hidden sm:flex relative w-9 h-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {user?.nombre?.[0]}{user?.apellido?.[0]}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-slate-700">{user?.nombre}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.rol}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
