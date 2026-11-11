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

const validBody = {
  cpf: '52998224725',
  nome: 'Fulano da Silva',
  data_nascimento: '15/03/1990',
  nome_mae: 'Maria da Silva',
  uf: 'SP',
  telefone: '11987654321',
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
          return new Response(
            JSON.stringify({
              query_id: 'qid-1',
              queue_depth: 2,
              queue_ahead: 1,
              queue_position: 2,
            }),
            { status: 202 },
          );
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
        if (String(url).endsWith('/queue')) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              queue_depth: 3,
              pending: 2,
              processing: 1,
              queue_max: 100,
            }),
            { status: 200 },
          );
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
      ctx('POST', '/api/score-tim', validBody) as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      query_id?: string;
      cpf_masked?: string;
      queue_depth?: number;
      queue_ahead?: number;
    };
    expect(body.query_id).toBe('qid-1');
    expect(body.cpf_masked).toMatch(/\*\*\*/);
    expect(body.queue_depth).toBe(2);
    expect(body.queue_ahead).toBe(1);
  });

  it('POST 422 sem celular válido', async () => {
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', { ...validBody, telefone: '1133334444' }) as never,
    );
    expect(res.status).toBe(422);
  });

  it('POST 422 CPF curto (não faz padStart)', async () => {
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', { ...validBody, cpf: '123' }) as never,
    );
    expect(res.status).toBe(422);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST 422 data de nascimento inválida', async () => {
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', { ...validBody, data_nascimento: '31/02/1990' }) as never,
    );
    expect(res.status).toBe(422);
  });

  it('POST deriva UF do DDD (RN)', async () => {
    const fetchMock = vi.mocked(fetch);
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', {
        ...validBody,
        uf: 'SP',
        telefone: '84999887766',
      }) as never,
    );
    expect(res.status).toBe(202);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/queries'));
    const sent = JSON.parse(String(call?.[1]?.body || '{}')) as {
      uf?: string;
      cep?: string;
      data_nascimento?: string;
    };
    expect(sent.uf).toBe('RN');
    expect(sent.cep).toBe('');
    expect(sent.data_nascimento).toBe('15/03/1990');
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

  it('GET queue=1 devolve snapshot da fila', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?queue=1') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      queue_depth?: number;
      pending?: number;
      processing?: number;
    };
    expect(body.queue_depth).toBe(3);
    expect(body.pending).toBe(2);
    expect(body.processing).toBe(1);
  });

  it('GET status 404 anexa snapshot sem inventar posição', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?query_id=desconhecido') as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      status?: string;
      queue_ahead?: number | null;
      queue_depth?: number;
    };
    expect(body.status).toBe('PROCESSING');
    expect(body.queue_ahead).toBeNull();
    expect(body.queue_depth).toBe(3);
  });

  it('GET lookup devolve found', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?lookup=1&cpf=52998224725') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found?: boolean };
    expect(body.found).toBe(true);
  });

  it('GET 422 query_id com caracteres inválidos', async () => {
    const res = await scoreTim.onRequestGet(
      ctx('GET', '/api/score-tim?query_id=../etc/passwd') as never,
    );
    expect(res.status).toBe(422);
  });

  it('403 para sessão sem acesso à aba', async () => {
    authAtual.value = {
      ok: true,
      mode: 'session',
      user: { id: '1', email: 'v@t.com', role: 'viewer', abas: ['dashboard'] },
    };
    const res = await scoreTim.onRequestPost(
      ctx('POST', '/api/score-tim', validBody) as never,
    );
    expect(res.status).toBe(403);
  });

  it('503 sem SCORE_TIM_BASE_URL', async () => {
    const res = await scoreTim.onRequestPost({
      env: { ...env, SCORE_TIM_BASE_URL: '' },
      request: ctx('POST', '/api/score-tim', validBody).request,
    } as never);
    expect(res.status).toBe(503);
  });

  it('503 sem SCORE_TIM_API_KEY', async () => {
    const res = await scoreTim.onRequestPost({
      env: { ...env, SCORE_TIM_API_KEY: '' },
      request: ctx('POST', '/api/score-tim', validBody).request,
    } as never);
    expect(res.status).toBe(503);
  });
});
