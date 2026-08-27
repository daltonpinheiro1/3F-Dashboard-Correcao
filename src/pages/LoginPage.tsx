import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isSessionValid } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSessionValid()) navigate('/dashboard', { replace: true });
  }, [isSessionValid, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Login via RPC (verifica senha + retorna dados, bypasses RLS)
      const { data, error: rpcError } = await supabase.rpc('login_user', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
      });

      if (rpcError) {
        console.error('login_user rpc', rpcError);
        setError(rpcError.message || 'Erro ao conectar. Tente novamente.');
        setLoading(false);
        return;
      }

      const result = data as any;

      if (!result || !result.success) {
        const errMsg = result?.error;
        if (errMsg === 'inactive') {
          setError('Conta desativada. Contate o administrador.');
        } else if (errMsg === 'locked') {
          setError('Muitas tentativas. Aguarde 15 minutos e tente de novo.');
        } else {
          setError('Email ou senha incorretos.');
        }
        setLoading(false);
        return;
      }

      login(result.email, result.full_name, result.role, {
        sessionExpiresAt: result.session_expires_at || null,
        sessionNonce: result.session_nonce || null,
      });
      navigate('/dashboard');
    } catch (err) {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-brand-navy via-gray-900 to-gray-800 flex items-center justify-center p-4 pb-safe">
      <div className="w-full max-w-sm page-enter">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl shadow-2xl overflow-hidden mb-4">
            <img src="/logo-3f-oficial.png" alt="3F" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-white text-xl font-bold">Dashboard Correção</h1>
          <p className="text-gray-400 text-sm mt-1">Monitoramento de qualidade cadastral</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 shadow-2xl space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-9"
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-9 pr-10"
                placeholder="Sua senha"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-xs mt-6">
          3F Contact Center - Bot Processamento iSize
        </p>
      </div>
    </div>
  );
}
