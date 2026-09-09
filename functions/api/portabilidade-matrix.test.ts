import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './portabilidade-matrix';

afterEach(() => vi.restoreAllMocks());

const env = {
  DASHBOARD_INSIGHT_SECRET: 'test-secret',
  PORTABILIDADE_SUPABASE_URL: 'https://port.test',
  PORTABILIDADE_SUPABASE_SERVICE_KEY: 'service-key',
};

function request() {
  return new Request('https://dash.test/api/portabilidade-matrix?dias=7', {
    headers: {
      Authorization: 'Bearer test-secret',
      'cf-connecting-ip': `test-${Math.random()}`,
    },
  });
}

describe('portabilidade-matrix API', () => {
  it('falha explicitamente quando uma fonte retorna erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('schema indisponível', { status: 400 })));
    const response = await onRequestGet({ request: request(), env });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('indisponível'),
    });
  });

  it('expõe cobertura das três leituras', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('retornos_reprocessamento')) {
        return Response.json([{ operacao: 'consult', adjustments: '[mx:abcdef12]' }]);
      }
      if (url.includes('acao=eq.cancel') || url.includes('acao=eq.cancel'.replace('=', '%3D'))) {
        return Response.json([]);
      }
      return Response.json([{ acao: 'activate', retorno_motivo: 'ICCID disponível' }]);
    }));
    const response = await onRequestGet({ request: request(), env });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      cobertura: { retornos: { lidos: number }; fila: { lidos: number } };
      decisoes: Array<{ label: string }>;
      fila_acoes: Array<{ label: string }>;
    };
    expect(body.cobertura.retornos.lidos).toBe(1);
    expect(body.cobertura.fila.lidos).toBe(1);
    expect(body.decisoes[0]?.label).toBe('consult');
    expect(body.fila_acoes[0]?.label).toBe('activate');
  });
});
