import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './knowledge-search';

afterEach(() => vi.unstubAllGlobals());

const env = {
  DASHBOARD_INSIGHT_SECRET: 'test-secret',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
};

function req(qs: string) {
  return new Request(`https://dash.test/api/knowledge-search${qs}`, {
    headers: { Authorization: 'Bearer test-secret', 'cf-connecting-ip': `test-${Math.random()}` },
  });
}

describe('knowledge-search API', () => {
  it('com pergunta, busca 500 candidatos antes de ranquear', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return Response.json([]);
    }));
    await onRequestGet({ request: req('?q=portabilidade'), env });
    expect(urls[0]).toContain('limit=500');
    expect(urls[0]).toContain('order=created_at.desc,id.desc');
  });

  it('sem pergunta, só os 12 mais recentes', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return Response.json([]);
    }));
    await onRequestGet({ request: req(''), env });
    expect(urls[0]).toContain('limit=12');
  });
});
