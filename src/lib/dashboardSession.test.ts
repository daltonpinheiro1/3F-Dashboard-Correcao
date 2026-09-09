import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState: {
  userEmail: string;
  sessionNonce: string | null;
  isSessionValid: () => boolean;
  clearLegacySessionNonce: () => void;
} = {
  userEmail: 'admin@3f.test',
  sessionNonce: 'a'.repeat(32),
  isSessionValid: () => true as boolean,
  clearLegacySessionNonce: () => {
    mockState.sessionNonce = null;
  },
};

vi.mock('../store/authStore', () => ({
  useAuthStore: {
    getState: () => mockState,
  },
}));

describe('dashboardSessionHeaders', () => {
  beforeEach(() => {
    mockState.userEmail = 'admin@3f.test';
    mockState.sessionNonce = 'a'.repeat(32);
    mockState.isSessionValid = () => true;
    vi.unstubAllGlobals();
  });

  it('monta headers de sessão sem Authorization secret', async () => {
    const { dashboardSessionHeaders, hasDashboardSession } = await import('./dashboardSession');
    expect(hasDashboardSession()).toBe(true);
    const h = dashboardSessionHeaders() as Record<string, string>;
    expect(h['X-Dashboard-Email']).toBe('admin@3f.test');
    expect(h['X-Dashboard-Session']).toHaveLength(32);
    expect(h.Authorization).toBeUndefined();
  });

  it('falha se sessão inválida', async () => {
    mockState.isSessionValid = () => false;
    const { dashboardSessionHeaders } = await import('./dashboardSession');
    expect(() => dashboardSessionHeaders()).toThrow(/Sessão expirada/);
  });

  it('aceita sessão restaurada cujo nonce está apenas no cookie HttpOnly', async () => {
    mockState.sessionNonce = null;
    const { dashboardSessionHeaders, hasDashboardSession } = await import('./dashboardSession');
    expect(hasDashboardSession()).toBe(true);
    expect(dashboardSessionHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('converte sessão legada em cookie pelo BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { bootstrapLegacyDashboardSession } = await import('./dashboardSession');
    await bootstrapLegacyDashboardSession();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth-bootstrap', {
      method: 'POST',
      headers: expect.objectContaining({
        'X-Dashboard-Email': 'admin@3f.test',
        'X-Dashboard-Session': 'a'.repeat(32),
      }),
    });
    expect(mockState.sessionNonce).toBeNull();
  });
});
