import { describe, expect, it, vi } from 'vitest';

const sbFetch = vi.hoisted(() => vi.fn());
vi.mock('../_lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/auth')>()),
  authorizeRequest: vi.fn(async () => ({ ok: true, mode: 'secret' })),
  sbFetch,
}));
vi.mock('../_lib/rateLimit', () => ({ allowRateDistributed: vi.fn(async () => true) }));

import { onRequestGet } from './cubo-overview';

describe('cubo-overview', () => {
  it('lê correcao_logs em ordem cronológica (id é UUID)', async () => {
    sbFetch.mockImplementation(async () => new Response('[]', { status: 200 }));
    const response = await onRequestGet({
      request: new Request('https://x/api/cubo-overview?de=2026-10-01&ate=2026-10-02'),
      env: {} as never,
    });
    expect(response.status).toBe(200);
    const ordens = Object.fromEntries(sbFetch.mock.calls.map((call) => {
      const url = new URL(`https://x${call[1]}`);
      return [url.pathname.split('/').pop(), url.searchParams.get('order')];
    }));
    expect(ordens.correcao_logs).toBe('data_venda.asc,created_at.asc,id.asc');
    expect(ordens.sms_eficiencia).toBe('data_venda.asc,id.asc');
    expect(ordens.toutbox_entrega).toBe('data_venda.asc,proposta_id.asc');
  });

  it('atribui ao humano mais recente quando as passagens chegam em ordem cronológica', async () => {
    sbFetch.mockImplementation(async (_env: unknown, path: string) => new Response(
      path.includes('correcao_logs')
        ? JSON.stringify([
          { proposta_id: '1', vendedor: 'Ana', tipos_erro: [] },
          { proposta_id: '1', vendedor: 'Bia', tipos_erro: [] },
          { proposta_id: '1', vendedor: 'Roboadm1', tipos_erro: [] },
        ])
        : '[]',
      { status: 200 },
    ));
    const response = await onRequestGet({
      request: new Request('https://x/api/cubo-overview?de=2026-10-01&ate=2026-10-01'),
      env: {} as never,
    });
    const body = (await response.json()) as { operadores: Array<{ vendedor: string }> };
    expect(body.operadores.map((o) => o.vendedor)).toEqual(['Bia']);
  });
});
