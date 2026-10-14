import { describe, expect, it, vi } from 'vitest';

const sbFetch = vi.hoisted(() => vi.fn());
vi.mock('../_lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/auth')>()),
  authorizeRequest: vi.fn(async () => ({ ok: true })),
  requireAdmin: (auth: unknown) => auth,
  sbFetch,
}));
vi.mock('../_lib/rateLimit', () => ({ allowRateDistributed: vi.fn(async () => true) }));

import { onRequestPost } from './events-recent';

const post = (body: string) => onRequestPost({
  request: new Request('https://x/api/events-recent', { method: 'POST', body }),
  env: {} as never,
});

describe('events-recent POST', () => {
  it('JSON malformado vira 400 sem tocar no banco', async () => {
    const response = await post('{titulo:');
    expect(response.status).toBe(400);
    expect(sbFetch).not.toHaveBeenCalled();
  });

  it('corpo que não é objeto vira 400', async () => {
    expect((await post('[1,2]')).status).toBe(400);
    expect((await post('null')).status).toBe(400);
    expect(sbFetch).not.toHaveBeenCalled();
  });

  it('corpo válido grava o evento', async () => {
    sbFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, titulo: 'x' }]), { status: 201 }));
    const response = await post(JSON.stringify({ titulo: 'x' }));
    expect(response.status).toBe(200);
    expect(sbFetch).toHaveBeenCalledTimes(1);
  });
});
