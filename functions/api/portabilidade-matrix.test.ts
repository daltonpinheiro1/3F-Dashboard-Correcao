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
      if (url.includes('/rpc/')) return new Response('{"code":"PGRST202"}', { status: 404 });
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
      const url = decodeURIComponent(String(input));
      if (url.includes('/rpc/')) return new Response('{"code":"PGRST202"}', { status: 404 });
      urls.push(url);
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

describe('portabilidade-matrix com resumo SQL (049)', () => {
  it('usa uma chamada só, exata e por proposta, com a janela ancorada', async () => {
    const chamadas: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(input), body: String(init?.body || '') });
      return Response.json({
        loop_min: 20,
        retornos: { linhas: 40874, propostas: 15153 },
        decisoes: [
          { label: 'no_action', linhas: 20796, propostas: 7688 },
          { label: 'consult_portability', linhas: 6763, propostas: 574 },
        ],
        sem_acao_motivos: [{ label: 'Não aprovado no crivo', linhas: 12602, propostas: 2880 }],
        fila: [
          { acao: 'cancel', status: 'cancelado', linhas: 1285, propostas: 200 },
          { acao: 'cancel', status: 'concluida', linhas: 209, propostas: 153 },
        ],
        fila_total: { linhas: 1494, propostas: 252 },
        cancelamentos: { linhas: 209, propostas: 153, motivos: [{ label: 'Rejeição do Cliente via SMS', linhas: 14, propostas: 14 }] },
        versoes: [
          { versao: 'cdcb9a05', linhas: 17960, propostas: 6000, desde: '2026-09-14T03:00:00Z', ate: '2026-09-27T14:06:00Z' },
          { versao: 'ff8e16e6', linhas: 22635, propostas: 9000, desde: '2026-09-27T14:07:00Z', ate: '2026-10-14T21:25:00Z' },
        ],
        loops: { total: 1, retornos: 385, por_operacao: { no_action: 1 }, top: [{ proposta: '3F-260043136', retornos: 385, operacao: 'no_action', motivo: 'x', ultimo: '2026-09-21T12:32:00Z' }] },
      });
    }));
    const response = await onRequestGet({ request: request('dias=30&ate=2020-08-31'), env });
    expect(response.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toContain('/rest/v1/rpc/portabilidade_matrix_resumo');
    expect(JSON.parse(chamadas[0].body)).toEqual({
      p_since: '2020-08-02T03:00:00.000Z',
      p_until: '2020-09-01T03:00:00.000Z',
    });
    const body = await response.json() as Record<string, any>;
    expect(body.exato).toBe(true);
    expect(body.fonte).toBe('resumo_sql');
    expect(body.matrix_version).toBe('ff8e16e6');
    expect(body.decisoes).toEqual([{ label: 'consult_portability', count: 574, linhas: 6763 }]);
    expect(body.sem_acao.propostas).toBe(7688);
    expect(body.fila_status[0]).toMatchObject({ acao: 'cancel', executada: 153, descartada: 200, linhas: 1494 });
    expect(body.canceladas.categorias.rejeicao_cliente).toBe(14);
    expect(body.canceladas.categorias.sem_resposta_sms).toBe(0);
    expect(body.loops.total).toBe(1);
    expect(body.loops.sem_acao).toBe(1);
    expect(body.cobertura.retornos).toEqual({ lidos: 40874, truncado: false });
  });

  it('erro diferente de função ausente não cai silenciosamente na leitura truncada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('timeout', { status: 500 })));
    const response = await onRequestGet({ request: request(), env });
    expect(response.status).toBe(502);
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
