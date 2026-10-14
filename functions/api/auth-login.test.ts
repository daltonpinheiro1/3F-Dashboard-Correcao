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

  it('envia o IP do cliente para o lockout por e-mail+IP no banco', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'invalid_password' }), { status: 200 }),
    );
    const response = await onRequestPost({
      request: new Request('https://dash.test/api/auth-login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.77' },
        body: JSON.stringify({ email: 'Admin@3F.test', password: 'errada' }),
      }),
      env,
    });
    expect(response.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      p_email: 'admin@3f.test',
      p_password: 'errada',
      p_ip: '203.0.113.77',
    });
  });

  it('cai para a assinatura antiga quando a 041 ainda não foi aplicada', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.login_user(p_email, p_ip, p_password)' }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            email: 'admin@3f.test',
            role: 'admin',
            session_nonce: 'n'.repeat(32),
          }),
          { status: 200 },
        ),
      );
    const response = await onRequestPost({
      request: new Request('https://dash.test/api/auth-login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.78' },
        body: JSON.stringify({ email: 'admin@3f.test', password: 'segredo' }),
      }),
      env,
    });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({
      p_email: 'admin@3f.test',
      p_password: 'segredo',
    });
  });

  it('não revela conta inativa com senha errada (mensagem genérica)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'not_found' }), { status: 200 }),
    );
    const response = await onRequestPost({
      request: new Request('https://dash.test/api/auth-login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.79' },
        body: JSON.stringify({ email: 'ninguem@3f.test', password: 'x' }),
      }),
      env,
    });
    expect(await response.json()).toEqual({ error: 'Email ou senha incorretos.' });
  });

  it('limita tentativas por IP+email sem bloquear outros usuários atrás do mesmo NAT', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ success: false, error: 'invalid_password' }), { status: 200 }),
    );
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const login = (email: string) =>
      onRequestPost({
        request: new Request('https://dash.test/api/auth-login', {
          method: 'POST',
          headers: { 'cf-connecting-ip': ip },
          body: JSON.stringify({ email, password: 'errada' }),
        }),
        env,
      });
    for (let i = 0; i < 12; i += 1) {
      expect((await login('alvo@3f.test')).status).toBe(401);
    }
    expect((await login('alvo@3f.test')).status).toBe(429);
    expect((await login('colega@3f.test')).status).toBe(401);
  });

  it('aplica teto por IP independente do email', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ success: false, error: 'not_found' }), { status: 200 }),
    );
    const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      const response = await onRequestPost({
        request: new Request('https://dash.test/api/auth-login', {
          method: 'POST',
          headers: { 'cf-connecting-ip': ip },
          body: JSON.stringify({ email: `u${i}@3f.test`, password: 'x' }),
        }),
        env,
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
