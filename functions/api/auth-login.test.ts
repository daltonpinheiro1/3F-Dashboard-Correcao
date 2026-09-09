import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './auth-login';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
};

afterEach(() => vi.restoreAllMocks());

describe('auth-login handler', () => {
  it('rejeita payload incompleto sem consultar o banco', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await onRequestPost({
      request: new Request('https://dash.test/api/auth-login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@3f.test' }),
      }),
      env,
    });
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emite cookie HttpOnly e não depende de login RPC no browser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          email: 'admin@3f.test',
          full_name: 'Admin',
          role: 'admin',
          session_expires_at: '2026-09-10T12:00:00.000Z',
          session_nonce: 'n'.repeat(32),
        }),
        { status: 200 },
      ),
    );
    const response = await onRequestPost({
      request: new Request('https://dash.test/api/auth-login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.10' },
        body: JSON.stringify({ email: 'admin@3f.test', password: 'segredo' }),
      }),
      env,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly.*Secure.*SameSite=Strict/);
  });
});
