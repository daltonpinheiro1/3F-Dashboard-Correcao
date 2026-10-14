import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './copilot';

afterEach(() => vi.unstubAllGlobals());

const env = { DASHBOARD_INSIGHT_SECRET: 'test-secret', OPENAI_API_KEY: 'sk-test-key' };

function request(body: unknown) {
  return new Request('https://dash.test/api/copilot', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-secret',
      'cf-connecting-ip': `test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

describe('copilot API', () => {
  it('erro da OpenAI não vaza detalhe bruto (chave mascarada, org) para o client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('{"error":{"message":"Incorrect API key provided: sk-proj-****WXYZ. org-ABC123"}}', { status: 401 }),
    ));
    const res = await onRequestPost({ request: request({ question: 'Qual o foco hoje?' }), env });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toMatch(/sk-|org-|Incorrect API key/);
  });

  it('não envia CPF/telefone da pergunta ao modelo', async () => {
    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent = String(init?.body || '');
      return Response.json({ choices: [{ message: { content: '## Diagnóstico\nok' } }] });
    }));
    const res = await onRequestPost({
      request: request({ question: 'Cliente CPF 123.456.789-09 tel (11) 98765-4321 travou?' }),
      env,
    });
    expect(res.status).toBe(200);
    expect(sent).not.toMatch(/123\.456\.789-09|98765-4321/);
  });
});
