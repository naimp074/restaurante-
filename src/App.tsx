import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Mesas from './pages/Mesas';
import Pedidos from './pages/Pedidos';
import Cocina from './pages/Cocina';
import Caja from './pages/Caja';
import Productos from './pages/Productos';
import Stock from './pages/Stock';
import Costos from './pages/Costos';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Configuracion from './pages/Configuracion';
import type { PageId } from './lib/types';

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
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'mesas': return <Mesas />;
      case 'pedidos': return <Pedidos />;
      case 'cocina': return <Cocina />;
      case 'caja': return <Caja />;
      case 'productos': return <Productos />;
      case 'stock': return <Stock />;
      case 'costos': return <Costos />;
      case 'reportes': return <Reportes />;
      case 'usuarios': return <Usuarios />;
      case 'configuracion': return <Configuracion />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
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
