import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie } from '../_lib/auth';
import { onRequestPost } from './dashboard-create-user';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
};

afterEach(() => vi.restoreAllMocks());

function mockCreate(create: () => Response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/rpc/verify_dashboard_session')) {
      return new Response(
        JSON.stringify({ valid: true, id: 'u1', email: 'admin@3f.test', role: 'admin', abas: [] }),
        { status: 200 },
      );
    }
    return create();
  });
}

function req() {
  return new Request('https://dash.test/api/dashboard-create-user', {
    method: 'POST',
    headers: {
      cookie: sessionCookie('admin@3f.test', 'n'.repeat(32)),
      'cf-connecting-ip': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify({ email: 'novo@3f.test', name: 'Novo', password: 'segredo1', role: 'viewer' }),
  });
}

describe('dashboard-create-user', () => {
  it('não devolve a mensagem bruta do Postgres e registra o detalhe no log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreate(
      () =>
        new Response(
          JSON.stringify({ code: '23502', message: 'null value in column "full_name" of relation "dashboard_users"' }),
          { status: 400 },
        ),
    );
    const res = await onRequestPost({ request: req(), env });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Falha ao criar usuário.' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('dashboard_create_user_failed');
  });

  it('mantém mensagens conhecidas', async () => {
    mockCreate(() => new Response(JSON.stringify({ message: 'duplicate key value' }), { status: 409 }));
    const res = await onRequestPost({ request: req(), env });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Email já cadastrado.' });
  });

  it('exceção de rede vira erro genérico', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const res = await onRequestPost({ request: req(), env });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Falha ao criar usuário.' });
  });
});
