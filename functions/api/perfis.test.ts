import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie } from '../_lib/auth';
import { onRequestPatch, onRequestPost, parseAbas } from './perfis';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
};

const PERFIL_ID = '11111111-2222-3333-4444-555555555555';

afterEach(() => vi.restoreAllMocks());

function mockSupabase(upsert: () => Response) {
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const fn = url.split('/rpc/')[1] || '';
    calls.push({ fn, body: JSON.parse(String(init?.body || '{}')) });
    if (fn === 'verify_dashboard_session') {
      return new Response(
        JSON.stringify({ valid: true, id: 'u1', email: 'admin@3f.test', role: 'admin', abas: [] }),
        { status: 200 },
      );
    }
    return upsert();
  });
  return calls;
}

function req(method: string, body: unknown) {
  return new Request('https://dash.test/api/perfis', {
    method,
    headers: {
      cookie: sessionCookie('admin@3f.test', 'n'.repeat(32)),
      'cf-connecting-ip': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

describe('parseAbas', () => {
  it('aceita ids do catálogo e remove duplicadas', () => {
    expect(parseAbas(['dashboard', 'rr', 'dashboard'])).toEqual({ ok: true, abas: ['dashboard', 'rr'] });
    expect(parseAbas(undefined)).toEqual({ ok: true, abas: [] });
  });

  it('rejeita ids fora do catálogo e tipos inválidos', () => {
    expect(parseAbas(['dashboard', 'root'])).toEqual({ ok: false, error: 'Aba(s) desconhecida(s): root.' });
    expect(parseAbas('dashboard').ok).toBe(false);
    expect(parseAbas([1]).ok).toBe(false);
  });
});

describe('perfis handler', () => {
  it('POST rejeita aba desconhecida sem chamar o upsert', async () => {
    const calls = mockSupabase(() => new Response('null', { status: 200 }));
    const res = await onRequestPost({ request: req('POST', { nome: 'Teste', abas: ['dashboard', 'x'] }), env });
    expect(res.status).toBe(400);
    expect(calls.map((c) => c.fn)).not.toContain('upsert_dashboard_perfil_by_session');
  });

  it('POST envia somente abas válidas', async () => {
    const calls = mockSupabase(() => new Response(JSON.stringify(PERFIL_ID), { status: 200 }));
    const res = await onRequestPost({ request: req('POST', { nome: 'Teste', abas: ['hora', 'hora'] }), env });
    expect(res.status).toBe(200);
    const upsert = calls.find((c) => c.fn === 'upsert_dashboard_perfil_by_session');
    expect(upsert?.body.p_abas).toEqual(['hora']);
  });

  it('PATCH não devolve mensagem bruta do Postgres', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSupabase(
      () =>
        new Response(
          JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "dashboard_perfis_slug_key"' }),
          { status: 409 },
        ),
    );
    const res = await onRequestPatch({ request: req('PATCH', { id: PERFIL_ID, nome: 'Teste', abas: [] }), env });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Falha ao atualizar perfil.');
    expect(body.error).not.toMatch(/constraint|duplicate/);
  });

  it('PATCH mapeia perfil_not_found para 404', async () => {
    mockSupabase(() => new Response(JSON.stringify({ message: 'perfil_not_found' }), { status: 400 }));
    const res = await onRequestPatch({ request: req('PATCH', { id: PERFIL_ID, nome: 'Teste', abas: [] }), env });
    expect(res.status).toBe(404);
  });
});
