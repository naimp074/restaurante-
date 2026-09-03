import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Profile, Rol } from '../lib/types';
import { mockProfile } from '../lib/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  modoDemo: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => void;
  hasRole: (...roles: Rol[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const demoStorageKey = 'demo_user';

const demoAccounts: Record<string, { profile: Profile; pass: string }> = {
  'admin@burger.com': { profile: { ...mockProfile, rol: 'admin' }, pass: 'admin123' },
  'encargado@burger.com': { profile: { ...mockProfile, id: 'enc-1', nombre: 'Diego', apellido: 'Fernández', rol: 'encargado' }, pass: 'encargado123' },
  'moza@burger.com': { profile: { ...mockProfile, id: 'moza-1', nombre: 'María', apellido: 'López', rol: 'moza' }, pass: 'moza123' },
  'cocina@burger.com': { profile: { ...mockProfile, id: 'coc-1', nombre: 'Pedro', apellido: 'Martínez', rol: 'cocina' }, pass: 'cocina123' },
  'caja@burger.com': { profile: { ...mockProfile, id: 'caj-1', nombre: 'Ana', apellido: 'Rodríguez', rol: 'cajero' }, pass: 'caja123' },
};

const mensajeError = (mensaje: string) => {
  const texto = mensaje.toLowerCase();
  if (texto.includes('invalid login credentials')) return 'Email o contraseña incorrectos';
  if (texto.includes('email not confirmed')) return 'Falta confirmar el email de esta cuenta';
  if (texto.includes('too many requests')) return 'Demasiados intentos, esperá un momento';
  if (texto.includes('failed to fetch')) return 'No hay conexión con el servidor';
  return mensaje;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const cargarPerfil = useCallback(async (authUser: User) => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error || !data) {
      // La sesión existe pero no hay perfil: sin rol no se puede operar.
      await supabase.auth.signOut();
      setUser(null);
      setLoading(false);
      return;
    }

    setUser(data as Profile);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      const stored = localStorage.getItem(demoStorageKey);
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          localStorage.removeItem(demoStorageKey);
        }
      }
      setLoading(false);
      return;
    }

    let activo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      if (data.session?.user) {
        void cargarPerfil(data.session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!activo) return;
      if (session?.user) {
        void cargarPerfil(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!supabase) {
      const account = demoAccounts[email.trim().toLowerCase()];
      if (!account || account.pass !== password) {
        return { error: 'Email o contraseña incorrectos' };
      }
      setUser(account.profile);
      localStorage.setItem(demoStorageKey, JSON.stringify(account.profile));
      return {};
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { error: mensajeError(error.message) };
    if (!data.user) return { error: 'No se pudo iniciar sesión' };

    await cargarPerfil(data.user);
    return {};
  };

  const signOut = () => {
    if (!supabase) {
      setUser(null);
      localStorage.removeItem(demoStorageKey);
      return;
    }
    void supabase.auth.signOut();
    setUser(null);
  };

  const hasRole = (...roles: Rol[]) => {
    if (!user) return false;
    return roles.includes(user.rol);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, modoDemo: !isSupabaseConfigured, signIn, signOut, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
