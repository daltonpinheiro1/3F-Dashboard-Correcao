import { useAuthStore } from '../store/authStore';

const LOGOUT_RPC_MS = 2500;

/**
 * Logout completo: limpa store local na hora e invalida nonce no servidor (best-effort).
 * Nunca bloqueia a UI — o fetch tem timeout e roda em background.
 */
export function logoutDashboardSession(): void {
  const { logout } = useAuthStore.getState();

  // Local primeiro — evita regressão se a rede pendurar
  logout();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOGOUT_RPC_MS);
  void fetch('/api/auth-logout', {
    method: 'POST',
    // O cookie HttpOnly identifica a sessão a invalidar.
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    signal: ac.signal,
  })
    .catch(() => {
      /* best-effort */
    })
    .finally(() => clearTimeout(timer));
}
