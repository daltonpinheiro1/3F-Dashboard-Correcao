import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './_middleware';

afterEach(() => vi.restoreAllMocks());

describe('middleware de observabilidade', () => {
  it('propaga request-id válido e mede a resposta', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await onRequest({
      request: new Request('https://dash.test/api/test?secret=nao-logar', {
        headers: { 'x-request-id': 'request-12345678' },
      }),
      next: async () => new Response('ok', { status: 200 }),
    } as unknown as Parameters<typeof onRequest>[0]);
    expect(response.headers.get('x-request-id')).toBe('request-12345678');
    expect(response.headers.get('server-timing')).toMatch(/^app;dur=/);
    expect(console.log).toHaveBeenCalledWith(expect.not.stringContaining('secret='));
  });

  it('transforma exceção em 500 correlacionável', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await onRequest({
      request: new Request('https://dash.test/api/falha'),
      next: async () => {
        throw new Error('dado sensível');
      },
    } as unknown as Parameters<typeof onRequest>[0]);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { request_id?: string; error?: string };
    expect(body.error).toBe('Erro interno.');
    expect(body.request_id).toBe(response.headers.get('x-request-id'));
    expect(console.log).toHaveBeenCalledWith(expect.not.stringContaining('dado sensível'));
  });
});
