import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './rr-insight';

afterEach(() => vi.unstubAllGlobals());

const env = { DASHBOARD_INSIGHT_SECRET: 'test-secret', OPENAI_API_KEY: 'sk-test-key' };

function request(body: unknown) {
  return new Request('https://dash.test/api/rr-insight', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-secret',
      'cf-connecting-ip': `test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

function stubOpenAi() {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body || ''));
    return Response.json({ choices: [{ message: { content: `## Situação\nresposta ${bodies.length}` } }] });
  }));
  return bodies;
}

describe('rr-insight API · cache por hash', () => {
  it('mesmo payload em 10 min não chama a OpenAI de novo (memória sem KV)', async () => {
    const bodies = stubOpenAi();
    const payload = { dataRef: '2026-10-14', campanha: 'TODAS', vendasEva: 101, metaDia: 200 };
    const a = await onRequestPost({ request: request(payload), env });
    const b = await onRequestPost({ request: request(payload), env });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const ja = (await a.json()) as { texto: string; cache?: boolean };
    const jb = (await b.json()) as { texto: string; cache?: boolean };
    expect(jb.texto).toBe(ja.texto);
    expect(jb.cache).toBe(true);
    expect(bodies).toHaveLength(1);
  });

  it('payload diferente gera nova chamada', async () => {
    const bodies = stubOpenAi();
    await onRequestPost({ request: request({ dataRef: '2026-10-14', vendasEva: 7 }), env });
    await onRequestPost({ request: request({ dataRef: '2026-10-14', vendasEva: 8 }), env });
    expect(bodies).toHaveLength(2);
  });

  it('usa KV quando há binding (RR_INSIGHT_CACHE) com TTL de 600s', async () => {
    const bodies = stubOpenAi();
    const store = new Map<string, string>();
    const put = vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    });
    const kv = { get: vi.fn(async (k: string) => store.get(k) ?? null), put } as unknown as KVNamespace;
    const envKv = { ...env, RR_INSIGHT_CACHE: kv };
    const payload = { dataRef: '2026-10-14', vendasEva: 999 };
    await onRequestPost({ request: request(payload), env: envKv });
    const b = await onRequestPost({ request: request(payload), env: envKv });
    expect(((await b.json()) as { cache?: boolean }).cache).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^rr-insight:v1:[0-9a-f]{64}$/), expect.any(String), {
      expirationTtl: 600,
    });
  });

  it('comparativo/reconcile/Monte Carlo chegam ao prompt', async () => {
    const bodies = stubOpenAi();
    await onRequestPost({
      request: request({
        vendasEva: 55,
        comparativo: { vsD1: 10, vsD7: -5, mtd: 900 },
        reconcile: { eva: 50, sms: 40, delta: 10, pct: 20, alerta: true },
        monteCarlo: { probabilidade: 30, meta: 120, projecaoP10: 80, projecaoP50: 95, projecaoP90: 110, horasRestantes: 3 },
      }),
      env,
    });
    const user = JSON.parse(bodies[0]).messages[1].content as string;
    expect(user).toContain('vs D-1 +10%');
    expect(user).toContain('Gross EVA 50 vs SMS 40');
    expect(user).toContain('P(meta 120) 30%');
  });

  it('OPENAI_MODEL_WORKHORSE sobrescreve o modelo', async () => {
    const bodies = stubOpenAi();
    await onRequestPost({
      request: request({ vendasEva: 31337 }),
      env: { ...env, OPENAI_MODEL_WORKHORSE: 'gpt-4.1-mini' },
    });
    expect(JSON.parse(bodies[0]).model).toBe('gpt-4.1-mini');
  });
});
