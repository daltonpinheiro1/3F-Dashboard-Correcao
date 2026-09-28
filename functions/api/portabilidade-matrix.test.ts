import { afterEach, describe, expect, it, vi } from 'vitest';
import { janelaMatrix, onRequestGet } from './portabilidade-matrix';

afterEach(() => vi.restoreAllMocks());

const env = {
  DASHBOARD_INSIGHT_SECRET: 'test-secret',
  PORTABILIDADE_SUPABASE_URL: 'https://port.test',
  PORTABILIDADE_SUPABASE_SERVICE_KEY: 'service-key',
};

function request(qs = 'dias=7') {
  return new Request(`https://dash.test/api/portabilidade-matrix?${qs}`, {
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

  it('âncora `ate` vira filtro lt nas mesmas 3 leituras (sem subrequest extra)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(decodeURIComponent(String(input)));
      return Response.json([]);
    }));
    const response = await onRequestGet({ request: request('dias=30&ate=2020-08-31'), env });
    expect(response.status).toBe(200);
    expect(urls).toHaveLength(3);
    for (const u of urls) {
      expect(u).toContain('.lt."2020-09-01T03:00:00.000Z")');
      expect(u).toContain('gte.2020-08-02T03:00:00.000Z');
    }
    const body = await response.json() as { janela: { ancorada: boolean; ate: string } };
    expect(body.janela).toMatchObject({ ancorada: true, ate: '2020-08-31' });
  });
});

describe('janelaMatrix', () => {
  const agora = new Date('2026-09-28T15:00:00Z');

  it('sem âncora: dias para trás a partir de hoje BRT', () => {
    expect(janelaMatrix('7', null, agora)).toEqual({
      dias: 7,
      since: '2026-09-22T03:00:00.000Z',
      until: null,
      ate: null,
    });
  });

  it('âncora no passado fecha no fim do dia BRT', () => {
    const j = janelaMatrix('30', '2026-08-31', agora);
    expect(j.since).toBe('2026-08-02T03:00:00.000Z');
    expect(j.until).toBe('2026-09-01T03:00:00.000Z');
    expect(j.ate).toBe('2026-08-31');
  });

  it('âncora hoje/futura ou inválida é ignorada; dias limitados a 1–30', () => {
    expect(janelaMatrix('7', '2026-09-28', agora).until).toBeNull();
    expect(janelaMatrix('7', '2026-02-31', agora).until).toBeNull();
    expect(janelaMatrix('7', 'lixo', agora).until).toBeNull();
    expect(janelaMatrix('90', null, agora).dias).toBe(30);
    expect(janelaMatrix('0', null, agora).dias).toBe(7);
  });
});
