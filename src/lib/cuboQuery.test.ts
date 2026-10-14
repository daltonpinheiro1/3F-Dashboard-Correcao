import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dashboardSession', () => ({
  dashboardSessionHeaders: () => ({
    'Content-Type': 'application/json',
    'X-Dashboard-Session': 'sessao-teste',
  }),
}));

import { queryCubo, queryCuboTodas, TetoCuboExcedido } from './cuboQuery';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queryCubo', () => {
  it('envia o contrato completo e repassa o AbortSignal', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ rows: [{ proposta_id: '123' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const opts = {
      table: 'correcao_logs' as const,
      select: ['proposta_id'],
      filters: [{ column: 'tipos_erro', op: 'contains' as const, value: ['cep'] }],
      order: { column: 'created_at', ascending: false },
      from: 20,
      to: 39,
      signal: controller.signal,
    };

    await expect(queryCubo<{ proposta_id: string }>(opts)).resolves.toEqual([
      { proposta_id: '123' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/cubo-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dashboard-Session': 'sessao-teste',
      },
      body: JSON.stringify(opts),
      cache: 'no-store',
      signal: controller.signal,
    });
  });

  it('propaga a mensagem de erro do endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Filtro inválido.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      queryCubo({ table: 'sms_eficiencia', select: ['proposta_id'] }),
    ).rejects.toThrow('Filtro inválido.');
  });
});

const pagina = (n: number) => new Response(
  JSON.stringify({ rows: Array.from({ length: n }, (_, i) => ({ i })) }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

describe('queryCuboTodas', () => {
  it('pagina de 1000 em 1000 até a página incompleta', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pagina(1000))
      .mockResolvedValueOnce(pagina(3));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await queryCuboTodas({ table: 'correcao_logs', select: ['id'] });
    expect(rows).toHaveLength(1003);
    const corpos = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(corpos.map((b) => [b.from, b.to])).toEqual([[0, 999], [1000, 1999]]);
  });

  it('lança ao bater o teto em vez de devolver total parcial', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pagina(1000)));
    await expect(queryCuboTodas({ table: 'correcao_logs', select: ['id'] }, () => true, 2000))
      .rejects.toBeInstanceOf(TetoCuboExcedido);
  });

  it('devolve null quando a consulta deixa de ser a vigente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pagina(1000)));
    await expect(queryCuboTodas({ table: 'correcao_logs', select: ['id'] }, () => false)).resolves.toBeNull();
  });
});
