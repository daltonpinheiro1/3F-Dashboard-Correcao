import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatBody,
  extractChatText,
  isReasoningModel,
  MODEL_REASONING,
  MODEL_WORKHORSE,
  modelReasoning,
  modelWorkhorse,
  openaiChat,
} from './openaiModels';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('openaiModels', () => {
  it('gpt-5-mini é reasoning: sem temperature, com max_completion_tokens', () => {
    expect(isReasoningModel(MODEL_REASONING)).toBe(true);
    const body = buildChatBody({
      model: MODEL_REASONING,
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.2,
      maxTokens: 900,
    });
    expect(body.max_completion_tokens).toBe(900);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('4o-mini usa temperature + max_tokens', () => {
    expect(isReasoningModel(MODEL_WORKHORSE)).toBe(false);
    const body = buildChatBody({
      model: MODEL_WORKHORSE,
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.25,
      maxTokens: 800,
    });
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0.25);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('extrai texto de content string ou array', () => {
    expect(extractChatText({ choices: [{ message: { content: '  oi  ' } }] })).toBe('oi');
    expect(
      extractChatText({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }),
    ).toBe('ab');
  });
});

describe('openaiModels · env e fallback', () => {
  it('modelo vem do env com fallback aos padrões', () => {
    expect(modelWorkhorse({})).toBe(MODEL_WORKHORSE);
    expect(modelReasoning(undefined)).toBe(MODEL_REASONING);
    expect(modelWorkhorse({ OPENAI_MODEL_WORKHORSE: ' gpt-4.1-mini ' })).toBe('gpt-4.1-mini');
    expect(modelReasoning({ OPENAI_MODEL_REASONING: 'o4-mini' })).toBe('o4-mini');
    expect(modelReasoning({ OPENAI_MODEL_REASONING: 'x y; drop' })).toBe(MODEL_REASONING);
  });

  const ok = () => Response.json({ choices: [{ message: { content: 'ok' } }] });

  function stub(primeiro: () => Response | Promise<Response>) {
    const models: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
      const m = JSON.parse(String(init?.body)).model as string;
      models.push(m);
      return models.length === 1 ? primeiro() : ok();
    }));
    return models;
  }

  const req = { model: 'gpt-5-mini', messages: [{ role: 'user' as const, content: 'x' }] };

  it.each([429, 500, 503])('HTTP %i usa fallback', async (status) => {
    const models = stub(() => new Response('x', { status }));
    const r = await openaiChat('k', req, { fallback: 'gpt-4o-mini' });
    expect(r.fallback_usado).toBe(true);
    expect(models).toEqual(['gpt-5-mini', 'gpt-4o-mini']);
  });

  it.each([400, 401])('HTTP %i não usa fallback', async (status) => {
    const models = stub(() => new Response('bad', { status }));
    await expect(openaiChat('k', req, { fallback: 'gpt-4o-mini' })).rejects.toThrow(`OpenAI ${status}`);
    expect(models).toEqual(['gpt-5-mini']);
  });

  it('timeout usa fallback', async () => {
    const models: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_u: unknown, init?: RequestInit) => {
      models.push(JSON.parse(String(init?.body)).model);
      if (models.length > 1) return Promise.resolve(ok());
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    const r = await openaiChat('k', req, { fallback: 'gpt-4o-mini', timeoutMs: 20 });
    expect(r.modelo).toBe('gpt-4o-mini');
    expect(models).toEqual(['gpt-5-mini', 'gpt-4o-mini']);
  });

  it('abort do chamador não dispara fallback', async () => {
    const ac = new AbortController();
    const models: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_u: unknown, init?: RequestInit) => {
      models.push(JSON.parse(String(init?.body)).model);
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    const p = openaiChat('k', req, { fallback: 'gpt-4o-mini', timeoutMs: 5_000, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow();
    expect(models).toEqual(['gpt-5-mini']);
  });
});
