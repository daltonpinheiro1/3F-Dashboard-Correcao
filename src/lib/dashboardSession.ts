import { useAuthStore } from '../store/authStore';

/**
 * Headers de sessão para Pages Functions.
 * NÃO usa VITE_DASHBOARD_INSIGHT_SECRET (secret não pode ir no bundle).
 */
export function dashboardSessionHeaders(extra?: HeadersInit): HeadersInit {
  const { userEmail, sessionNonce, isSessionValid } = useAuthStore.getState();
  if (!isSessionValid() || !userEmail || !sessionNonce) {
    throw new Error('Sessão expirada. Faça logout/login.');
  }
  return {
    'Content-Type': 'application/json',
    'X-Dashboard-Email': userEmail.trim().toLowerCase(),
    'X-Dashboard-Session': sessionNonce,
    ...(extra || {}),
  };
}

export function hasDashboardSession(): boolean {
  const { userEmail, sessionNonce, isSessionValid } = useAuthStore.getState();
  return Boolean(isSessionValid() && userEmail && sessionNonce);
}
