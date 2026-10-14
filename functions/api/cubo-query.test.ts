import { describe, expect, it, vi } from 'vitest';

const sbFetch = vi.hoisted(() => vi.fn());
vi.mock('../_lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/auth')>()),
  authorizeRequest: vi.fn(async () => ({ ok: true, mode: 'secret' })),
  sbFetch,
}));
vi.mock('../_lib/rateLimit', () => ({ allowRateDistributed: vi.fn(async () => true) }));

import { cuboFilterValue, onRequestPost } from './cubo-query';

describe('cubo-query paginação', () => {
  it('pede só a faixa, sem count=exact a cada página', async () => {
    sbFetch.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const request = new Request('https://x/api/cubo-query', {
      method: 'POST',
      body: JSON.stringify({ table: 'correcao_logs', select: ['proposta_id'], from: 1000, to: 1999 }),
    });
    const response = await onRequestPost({ request, env: {} as never });
    expect(response.status).toBe(200);
    const headers = sbFetch.mock.calls[0][2].headers as Record<string, string>;
    expect(headers.Range).toBe('1000-1999');
    expect(headers.Prefer).toBeUndefined();
  });
});

describe('cubo-query encoding', () => {
  it('deixa a codificação para URLSearchParams sem duplicar percentuais', () => {
    const params = new URLSearchParams();
    params.append(
      'tipos_erro',
      cuboFilterValue({ column: 'tipos_erro', op: 'contains', value: ['ação & cep'] }),
    );
    params.append(
      'vendedor',
      cuboFilterValue({ column: 'vendedor', op: 'eq', value: 'José % Silva' }),
    );

    const roundTrip = new URLSearchParams(params.toString());
    expect(roundTrip.get('tipos_erro')).toBe('cs.{"ação & cep"}');
    expect(roundTrip.get('vendedor')).toBe('eq.José % Silva');
    expect(params.toString()).not.toContain('%25C3');
  });

  it('usa literal Postgres para contains em TEXT[]', () => {
    expect(
      cuboFilterValue({ column: 'tipos_erro', op: 'contains', value: ['ddd_fora_estado'] }),
    ).toBe('cs.{"ddd_fora_estado"}');
  });

  it('escapa valores textuais do operador in', () => {
    expect(
      cuboFilterValue({
        column: 'fluxo',
        op: 'in',
        value: ['portabilidade', 'e"sim', 'com,virgula'],
      }),
    ).toBe('in.("portabilidade","e\\"sim","com,virgula")');
  });
});
