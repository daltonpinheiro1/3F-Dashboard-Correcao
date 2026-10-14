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
    expect(h['X-Dashboard-Email']).toBeUndefined();
    expect(h['X-Dashboard-Session']).toBeUndefined();
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

  it('nunca envia nonce em header, mesmo com nonce legado na memória', async () => {
    const { dashboardSessionHeaders } = await import('./dashboardSession');
    const h = dashboardSessionHeaders() as Record<string, string>;
    expect(Object.keys(h)).toEqual(['Content-Type']);
  });
});
