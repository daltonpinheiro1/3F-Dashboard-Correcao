import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = {
  userEmail: 'admin@3f.test',
  sessionNonce: 'a'.repeat(32),
  isSessionValid: () => true as boolean,
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
});
