import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Mesas from './pages/Mesas';
import Pedidos from './pages/Pedidos';
import Cocina from './pages/Cocina';
import Caja from './pages/Caja';
import Cobros from './pages/Cobros';
import Productos from './pages/Productos';
import Stock from './pages/Stock';
import Proveedores from './pages/Proveedores';
import Gastos from './pages/Gastos';
import Costos from './pages/Costos';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Configuracion from './pages/Configuracion';
import type { PageId } from './lib/types';
import { dayKey } from './lib/fechas';

const cajaStorageKey = 'restaurant-cajas-diarias';
const todayKey = () => dayKey();

const hasOpenCajaToday = () => {
  try {
    const saved = window.localStorage.getItem(cajaStorageKey);
    if (!saved) return false;
    const cajas = JSON.parse(saved) as Array<{ fecha: string; estado: string }>;
    return Array.isArray(cajas) && cajas.some(caja => caja.fecha === todayKey() && caja.estado === 'abierta');
  } catch {
    return false;
  }
};

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <div className="text-slate-400 text-sm">Cargando...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    const effectivePage: PageId = user.rol === 'cajero' && !hasOpenCajaToday() ? 'caja' : currentPage;

    switch (effectivePage) {
      case 'dashboard': return <Dashboard />;
      case 'mesas': return <Mesas />;
      case 'pedidos': return <Pedidos />;
      case 'cocina': return <Cocina />;
      case 'caja': return <Caja />;
      case 'caja_dia': return <Caja apartadoInicial="dia" />;
      case 'caja_arqueos': return <Caja apartadoInicial="arqueos" />;
      case 'cobros': return <Cobros />;
      case 'ventas': return <Pedidos />;
      case 'productos': return <Productos />;
      case 'combos': return <Productos apartadoInicial="combos" />;
      case 'lista_precios': return <Productos apartadoInicial="precios" />;
      case 'stock': return <Stock />;
      case 'stock_insumos': return <Stock apartadoInicial="stock" />;
      case 'stock_consumos': return <Stock apartadoInicial="consumos" />;
      case 'stock_produccion': return <Stock apartadoInicial="produccion" />;
      case 'proveedores': return <Proveedores />;
      case 'gastos': return <Gastos />;
      case 'costos': return <Costos />;
      case 'reportes': return <Reportes />;
      case 'usuarios': return <Usuarios />;
      case 'configuracion': return <Configuracion />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout
      currentPage={user.rol === 'cajero' && !hasOpenCajaToday() ? 'caja' : currentPage}
      onNavigate={setCurrentPage}
    >
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
