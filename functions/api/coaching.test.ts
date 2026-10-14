import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCoachingTableCache, onRequestGet, onRequestPatch, onRequestPost } from './coaching';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => _resetCoachingTableCache());

const env = {
  DASHBOARD_INSIGHT_SECRET: 'test-secret',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
};

function req(method: string, body?: string, qs = '') {
  return new Request(`https://dash.test/api/coaching${qs}`, {
    method,
    headers: { Authorization: 'Bearer test-secret', 'cf-connecting-ip': `test-${Math.random()}` },
    body,
  });
}

describe('coaching API', () => {
  it('POST com JSON inválido → 400 (não 500)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const res = await onRequestPost({ request: req('POST', '{nope'), env });
    expect(res.status).toBe(400);
  });

  it('PATCH com JSON inválido → 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const res = await onRequestPatch({ request: req('PATCH', 'x', '?id=1'), env });
    expect(res.status).toBe(400);
  });

  it('sugestao acima do limite → 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const res = await onRequestPost({
      request: req('POST', JSON.stringify({ sugestao: 'a'.repeat(2_001) })),
      env,
    });
    expect(res.status).toBe(400);
  });

  it('verifica a tabela uma vez e reaproveita nas chamadas seguintes', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return Response.json([]);
    }));
    await onRequestGet({ request: req('GET'), env });
    await onRequestGet({ request: req('GET'), env });
    await onRequestGet({ request: req('GET'), env });
    expect(urls.filter((u) => u.includes('select=id&limit=1'))).toHaveLength(1);
  });
});
