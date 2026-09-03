import { useState } from 'react';
import { UtensilsCrossed, Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signIn, modoDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const quickLogin = async (email: string, pass: string) => {
    setEmail(email);
    setPassword(pass);
    setError('');
    setLoading(true);
    const result = await signIn(email, pass);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  const demoAccounts = [
    { label: 'Admin', email: 'admin@burger.com', pass: 'admin123', color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' },
    { label: 'Encargado', email: 'encargado@burger.com', pass: 'encargado123', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
    { label: 'Moza', email: 'moza@burger.com', pass: 'moza123', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
    { label: 'Cocina', email: 'cocina@burger.com', pass: 'cocina123', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
    { label: 'Caja', email: 'caja@burger.com', pass: 'caja123', color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-amber-500/30">
            <UtensilsCrossed size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">BurgerPOS</h1>
          <p className="text-slate-400 mt-1">Sistema de Gestión de Restaurante</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@burger.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white placeholder-slate-500 outline-none focus:border-amber-500/50 focus:bg-white/8 transition-colors text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-white placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 text-sm"
            >
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
          </form>

          {modoDemo && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-xs text-slate-500 mb-3 text-center">Acceso rápido (demo)</p>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map(acc => (
                  <button
                    key={acc.label}
                    onClick={() => quickLogin(acc.email, acc.pass)}
                    disabled={loading}
                    className={`px-3 py-2 border rounded-lg text-xs font-medium transition-colors ${acc.color}`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
