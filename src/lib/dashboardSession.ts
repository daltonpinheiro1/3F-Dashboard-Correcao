import { useAuthStore } from '../store/authStore';

/**
 * Headers de sessão para Pages Functions.
 * NÃO usa VITE_DASHBOARD_INSIGHT_SECRET (secret não pode ir no bundle).
 */
export function dashboardSessionHeaders(extra?: HeadersInit): HeadersInit {
  const { userEmail, sessionNonce, isSessionValid } = useAuthStore.getState();
  if (!isSessionValid() || !userEmail) {
    throw new Error('Sessão expirada. Faça logout/login.');
  }
  return {
    'Content-Type': 'application/json',
    // Headers legados só existem até o primeiro refresh após login.
    // O caminho principal é o cookie HttpOnly emitido por /api/auth-login.
    ...(sessionNonce
      ? {
          'X-Dashboard-Email': userEmail.trim().toLowerCase(),
          'X-Dashboard-Session': sessionNonce,
        }
      : {}),
    ...(extra || {}),
  };
}

export function hasDashboardSession(): boolean {
  const { userEmail, isSessionValid } = useAuthStore.getState();
  return Boolean(isSessionValid() && userEmail);
}

let bootstrapPromise: Promise<void> | null = null;

/** Migra silenciosamente sessões antigas em localStorage para cookie HttpOnly. */
export function bootstrapLegacyDashboardSession(): Promise<void> {
  const { sessionNonce } = useAuthStore.getState();
  if (!sessionNonce) return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = fetch('/api/auth-bootstrap', {
      method: 'POST',
      headers: dashboardSessionHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
        if (body?.ok === true) useAuthStore.getState().clearLegacySessionNonce();
      })
      .finally(() => {
        bootstrapPromise = null;
      });
  }
  return bootstrapPromise;
}
