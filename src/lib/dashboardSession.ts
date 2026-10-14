import { useAuthStore } from '../store/authStore';

/**
 * Headers de sessão para Pages Functions.
 * NÃO usa VITE_DASHBOARD_INSIGHT_SECRET (secret não pode ir no bundle).
 */
export function dashboardSessionHeaders(extra?: HeadersInit): HeadersInit {
  const { userEmail, isSessionValid } = useAuthStore.getState();
  if (!isSessionValid() || !userEmail) {
    throw new Error('Sessão expirada. Faça logout/login.');
  }
  // A credencial vai no cookie HttpOnly (__Host-3f-dashboard-session).
  return {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

export function hasDashboardSession(): boolean {
  const { userEmail, isSessionValid } = useAuthStore.getState();
  return Boolean(isSessionValid() && userEmail);
}

/** Atualiza abas/perfil a partir da sessão no cookie (sessões antigas sem `abas`). */
export async function hydrateAuthAbasFromSession(): Promise<void> {
  if (!hasDashboardSession()) return;
  try {
    const r = await fetch('/api/auth-session', { headers: dashboardSessionHeaders() });
    if (!r.ok) return;
    const body = (await r.json().catch(() => null)) as {
      abas?: string[];
      perfil_slug?: string;
      role?: string;
      full_name?: string;
    } | null;
    if (!body) return;
    useAuthStore.getState().hydrateAbas({
      abas: Array.isArray(body.abas) ? body.abas : [],
      perfilSlug: body.perfil_slug,
      userRole: body.role,
      userName: body.full_name,
    });
  } catch {
    /* fallback role */
  }
}
