import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dashboardSession', () => ({
  dashboardSessionHeaders: () => ({
    'Content-Type': 'application/json',
    'X-Dashboard-Session': 'sessao-teste',
  }),
}));

import { queryCubo } from './cuboQuery';

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
