import { useAuthStore } from '../store/authStore';

const LOGOUT_RPC_MS = 2500;

/**
 * Logout completo: limpa store local na hora e invalida nonce no servidor (best-effort).
 * Nunca bloqueia a UI — o fetch tem timeout e roda em background.
 */
export function logoutDashboardSession(): void {
  const { userEmail, sessionNonce, logout } = useAuthStore.getState();
  const email = (userEmail || '').trim().toLowerCase();
  const nonce = sessionNonce || '';

  // Local primeiro — evita regressão se a rede pendurar
  logout();

  if (!email || nonce.length < 16) return;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LOGOUT_RPC_MS);
  void fetch('/api/auth-logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-Email': email,
      'X-Dashboard-Session': nonce,
    },
    keepalive: true,
    signal: ac.signal,
  })
    .catch(() => {
      /* best-effort */
    })
    .finally(() => clearTimeout(timer));
}
