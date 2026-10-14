import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './rr-360';

afterEach(() => vi.unstubAllGlobals());

const env = {
  DASHBOARD_INSIGHT_SECRET: 'test-secret',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
};

function request(qs = 'dataRef=2026-10-13&mes=2026-10') {
  return new Request(`https://dash.test/api/rr-360?${qs}`, {
    headers: {
      Authorization: 'Bearer test-secret',
      'cf-connecting-ip': `test-${Math.random()}`,
    },
  });
}

describe('rr-360 API', () => {
  it('pagina com ORDER estável, sem count=exact e com o universo de fluxo da aba SMS', async () => {
    const calls: Array<{ url: string; prefer: string | null }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: decodeURIComponent(String(input)),
        prefer: new Headers(init?.headers).get('Prefer'),
      });
      return Response.json([]);
    }));

    const res = await onRequestGet({ request: request(), env });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.url).toMatch(/[?&]order=/);
      expect(c.prefer).toBeNull();
    }
    const sms = calls.filter((c) => c.url.includes('/sms_eficiencia?'));
    expect(sms).toHaveLength(2);
    for (const c of sms) expect(c.url).toContain('fluxo=in.(portabilidade,esim)');
    const erro = calls.find((c) => c.url.includes('/correcao_logs?'));
    expect(erro?.url).toContain('order=created_at.asc,id.asc');
  });

  it('taxa de erro conta proposta (não passagem) e ignora robô, como a aba Erros', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/correcao_logs?')) {
        return Response.json([
          { proposta_id: 'P1', vendedor: 'roboadm1', tipos_erro: [] },
          { proposta_id: 'P1', vendedor: 'Ana', tipos_erro: ['cep_incorreto'] },
          { proposta_id: 'P1', vendedor: 'roboadm1', tipos_erro: ['cep_incorreto'] },
          { proposta_id: 'P2', vendedor: 'Bia', tipos_erro: [] },
          { proposta_id: 'P3', vendedor: 'roboadm2', tipos_erro: ['bairro'] },
        ]);
      }
      return Response.json([]);
    }));

    const res = await onRequestGet({ request: request(), env });
    const body = (await res.json()) as {
      propostas: number;
      comErro: number;
      taxaErroPct: number;
      listaErro: Array<{ proposta_id: string }>;
    };
    expect(body.propostas).toBe(2);
    expect(body.comErro).toBe(1);
    expect(body.taxaErroPct).toBe(50);
    expect(body.listaErro.map((r) => r.proposta_id)).toEqual(['P1']);
  });

  it('sinaliza truncamento quando uma fonte bate o teto de 30 mil linhas', async () => {
    const cheio = Array.from({ length: 1000 }, (_, i) => ({ proposta_id: `P${i}`, vendedor: 'Ana', tipos_erro: [] }));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) =>
      Response.json(String(input).includes('/correcao_logs?') ? cheio : []),
    ));
    const res = await onRequestGet({ request: request(), env });
    const body = (await res.json()) as { truncado: boolean };
    expect(body.truncado).toBe(true);
  });

  it('não sinaliza truncamento abaixo do teto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const res = await onRequestGet({ request: request(), env });
    expect(((await res.json()) as { truncado: boolean }).truncado).toBe(false);
  });

  it('Gross usa a linha SMS mais recente (retorno_atualizado_em), como a aba SMS', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      urls.push(url);
      if (url.includes('/sms_eficiencia?') && url.includes('data_venda=gte')) {
        return Response.json([
          { proposta_id: 'X', ticket_status: 'Portado', retorno_atualizado_em: '2026-10-13T10:00:00Z' },
          { proposta_id: 'X', ticket_status: 'Portabilidade Cancelada', retorno_atualizado_em: '2026-10-13T15:00:00Z' },
        ]);
      }
      return Response.json([]);
    }));
    const res = await onRequestGet({ request: request(), env });
    const body = (await res.json()) as { vendasBrutas: number; portadosConsolidado: number };
    expect(body.vendasBrutas).toBe(1);
    expect(body.portadosConsolidado).toBe(0);
    expect(urls.find((u) => u.includes('data_venda=gte'))).toContain('retorno_atualizado_em');
  });
});
