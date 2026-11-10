import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult } from '../_lib/auth';

const authAtual = vi.hoisted(() => ({ value: { ok: true, mode: 'secret' } as AuthResult }));

vi.mock('../_lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/auth')>()),
  authorizeRequest: vi.fn(async () => authAtual.value),
}));
vi.mock('../_lib/rateLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/rateLimit')>()),
  allowRateDistributed: vi.fn(async () => true),
}));

import * as scoreTim from './score-tim';

const env = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
  SCORE_TIM_BASE_URL: 'http://bot.test:8000',
  SCORE_TIM_API_KEY: 'bot-key',
};

function ctx(method: string, path: string, body?: unknown) {
  return {
    env,
    request: new Request(`https://dash.test${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

describe('score-tim BFF', () => {
  beforeEach(() => {
    authAtual.value = { ok: true, mode: 'secret' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/queries') && init?.method === 'POST') {
          return new Response(JSON.stringify({ query_id: 'qid-1' }), { status: 202 });
        }
        if (String(url).includes('/queries/qid-1')) {
          return new Response(
            JSON.stringify({
              query_id: 'qid-1',
              status: 'APPROVED',
              score: 70,
              outcome_code: 'SCORE_APROVADO',
              plans: [],
            }),
            { status: 200 },
          );
        }
        if (String(url).includes('/lookup')) {
          return new Response(JSON.stringify({ found: true, nome: 'Fulano' }), {
            status: 200,
          });
        }
        return new Response('nope', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POST enfileira e devolve query_id (202)', async () => {
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', {
        cpf: '12345678901',
        nome: 'Fulano',
        data_nascimento: '01/01/1990',
        nome_mae: 'Maria',
        uf: 'SP',
      }) as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { query_id?: string };
    expect(body.query_id).toBe('qid-1');
  });

  it('GET status devolve APPROVED', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?query_id=qid-1') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; score?: number };
    expect(body.status).toBe('APPROVED');
    expect(body.score).toBe(70);
  });

  it('GET lookup devolve found', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?lookup=1&cpf=12345678901') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found?: boolean };
    expect(body.found).toBe(true);
  });

  it('403 para sessão sem acesso à aba', async () => {
    authAtual.value = {
      ok: true,
      mode: 'session',
      user: { id: '1', email: 'v@t.com', role: 'viewer', abas: ['dashboard'] },
    };
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', {
        cpf: '12345678901',
        nome: 'F',
        data_nascimento: '01/01/1990',
        nome_mae: 'M',
        uf: 'SP',
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it('503 sem SCORE_TIM_BASE_URL', async () => {
    const res = await scoreTim.onRequestPost({
      env: { ...env, SCORE_TIM_BASE_URL: '' },
      request: ctx('POST', '/api/score-tim', {
        cpf: '12345678901',
        nome: 'F',
        data_nascimento: '01/01/1990',
        nome_mae: 'M',
        uf: 'SP',
      }).request,
    } as never);
    expect(res.status).toBe(503);
  });
});
