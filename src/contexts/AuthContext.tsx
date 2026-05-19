import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Profile, Rol } from '../lib/types';
import { mockProfile } from '../lib/mockData';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => void;
  hasRole: (...roles: Rol[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('demo_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('demo_user');
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const demoAccounts: Record<string, { profile: Profile; pass: string }> = {
      'admin@burger.com': { profile: { ...mockProfile, rol: 'admin' }, pass: 'admin123' },
      'encargado@burger.com': { profile: { ...mockProfile, id: 'enc-1', nombre: 'Diego', apellido: 'Fernández', rol: 'encargado' }, pass: 'encargado123' },
      'moza@burger.com': { profile: { ...mockProfile, id: 'moza-1', nombre: 'María', apellido: 'López', rol: 'moza' }, pass: 'moza123' },
      'cocina@burger.com': { profile: { ...mockProfile, id: 'coc-1', nombre: 'Pedro', apellido: 'Martínez', rol: 'cocina' }, pass: 'cocina123' },
      'caja@burger.com': { profile: { ...mockProfile, id: 'caj-1', nombre: 'Ana', apellido: 'Rodríguez', rol: 'cajero' }, pass: 'caja123' },
    };

    const account = demoAccounts[email.toLowerCase()];
    if (!account || account.pass !== password) {
      return { error: 'Email o contraseña incorrectos' };
    }

    setUser(account.profile);
    localStorage.setItem('demo_user', JSON.stringify(account.profile));
    return {};
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('demo_user');
  };

  const hasRole = (...roles: Rol[]) => {
    if (!user) return false;
    return roles.includes(user.rol);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
