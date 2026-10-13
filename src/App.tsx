import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import type { PageId } from './lib/types';
import { dayKey } from './lib/fechas';
import { hashDePagina, paginaDesdeHash, paginaInicial, puedeVerPagina } from './lib/paginas';
import SyncProvider from './lib/sync/SyncProvider';

// Cada pantalla se descarga la primera vez que se abre.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Mesas = lazy(() => import('./pages/Mesas'));
const Pedidos = lazy(() => import('./pages/Pedidos'));
const Cocina = lazy(() => import('./pages/Cocina'));
const Caja = lazy(() => import('./pages/Caja'));
const Cobros = lazy(() => import('./pages/Cobros'));
const CuentaCorriente = lazy(() => import('./pages/CuentaCorriente'));
const Productos = lazy(() => import('./pages/Productos'));
const Stock = lazy(() => import('./pages/Stock'));
const Proveedores = lazy(() => import('./pages/Proveedores'));
const Gastos = lazy(() => import('./pages/Gastos'));
const Costos = lazy(() => import('./pages/Costos'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Configuracion = lazy(() => import('./pages/Configuracion'));

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

const usePaginaEnHash = () => {
  const [pagina, setPagina] = useState<PageId | null>(() => paginaDesdeHash(window.location.hash));

  useEffect(() => {
    const alCambiar = () => setPagina(paginaDesdeHash(window.location.hash));
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const navegar = useCallback((destino: PageId) => {
    if (window.location.hash !== hashDePagina(destino)) window.location.hash = hashDePagina(destino);
    setPagina(destino);
  }, []);

  return [pagina, navegar] as const;
};

const CargandoPagina = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = usePaginaEnHash();

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

  const solicitada = currentPage ?? paginaInicial(user.rol);
  const permitida = puedeVerPagina(user.rol, solicitada) ? solicitada : paginaInicial(user.rol);
  const effectivePage: PageId = user.rol === 'cajero' && !hasOpenCajaToday() ? 'caja' : permitida;

  const renderPage = () => {
    switch (effectivePage) {
      case 'dashboard': return <Dashboard />;
      case 'mesas': return <Mesas />;
      case 'pedidos': return <Pedidos />;
      case 'cocina': return <Cocina />;
      case 'caja': return <Caja />;
      case 'caja_dia': return <Caja apartadoInicial="dia" />;
      case 'caja_arqueos': return <Caja apartadoInicial="arqueos" />;
      case 'cobros': return <Cobros />;
      case 'cuenta_corriente': return <CuentaCorriente />;
      case 'ventas': return <Pedidos />;
      case 'productos': return <Productos />;
      case 'combos': return <Productos apartadoInicial="combos" />;
      case 'lista_precios': return <Productos apartadoInicial="precios" />;
      case 'diferentes_listas': return <Productos apartadoInicial="listas" />;
      case 'stock': return <Stock />;
      case 'stock_insumos': return <Stock apartadoInicial="stock" />;
      case 'stock_consumos': return <Stock apartadoInicial="consumos" />;
      case 'stock_produccion': return <Stock apartadoInicial="produccion" />;
      case 'proveedores': return <Proveedores />;
      case 'gastos': return <Gastos key="gastos" onNavigate={setCurrentPage} />;
      case 'gastos_pagos': return <Gastos key="gastos-pagos" apartadoInicial="pagos" onNavigate={setCurrentPage} />;
      case 'gastos_traspasos': return <Gastos key="gastos-traspasos" apartadoInicial="traspasos" onNavigate={setCurrentPage} />;
      case 'costos': return <Costos />;
      case 'reportes': return <Reportes />;
      case 'usuarios': return <Usuarios />;
      case 'configuracion': return <Configuracion />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={effectivePage} onNavigate={setCurrentPage}>
      <Suspense fallback={<CargandoPagina />}>{renderPage()}</Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <AppContent />
      </SyncProvider>
    </AuthProvider>
  );
}
