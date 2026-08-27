import { useAuthStore } from '../store/authStore';

/**
 * Logout completo: invalida nonce no servidor (best-effort) e limpa store local.
 */
export async function logoutDashboardSession(): Promise<void> {
  const { userEmail, sessionNonce, logout } = useAuthStore.getState();
  try {
    if (userEmail && sessionNonce && sessionNonce.length >= 16) {
      await fetch('/api/auth-logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dashboard-Email': userEmail.trim().toLowerCase(),
          'X-Dashboard-Session': sessionNonce,
        },
        keepalive: true,
      });
    }
  } catch {
    // best-effort — cliente sempre limpa
  }
  logout();
}
