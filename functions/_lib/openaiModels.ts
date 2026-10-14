/**
 * Política de modelos OpenAI — 3F Dashboard.
 *
 * - WORKHORSE (4o-mini): JSON/visão (atestado, advertência, fatia, RR)
 * - REASONING (5-mini): Copiloto e Hora — raciocínio com contexto live
 * - FRONTIER (5.1): nunca default (custo ~8–17× vs 4o-mini)
 * Override por env: OPENAI_MODEL_WORKHORSE / OPENAI_MODEL_REASONING.
 */
export const MODEL_WORKHORSE = 'gpt-4o-mini';
export const MODEL_REASONING = 'gpt-5-mini';
export const MODEL_FRONTIER = 'gpt-5.1';

export type OpenAiModelEnv = {
  OPENAI_MODEL_WORKHORSE?: string;
  OPENAI_MODEL_REASONING?: string;
};

const MODEL_ID = /^[A-Za-z0-9._:-]{2,64}$/;

function modelDoEnv(v: string | undefined, padrao: string): string {
  const t = (v || '').trim();
  return MODEL_ID.test(t) ? t : padrao;
}

export function modelWorkhorse(env?: OpenAiModelEnv | null): string {
  return modelDoEnv(env?.OPENAI_MODEL_WORKHORSE, MODEL_WORKHORSE);
}

export function modelReasoning(env?: OpenAiModelEnv | null): string {
  return modelDoEnv(env?.OPENAI_MODEL_REASONING, MODEL_REASONING);
}

export class OpenAiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly timeout = false,
  ) {
    super(message);
    this.name = 'OpenAiError';
  }
}

/** Fallback de modelo só quando trocar de modelo pode ajudar: 429, 5xx ou timeout. */
export function deveTentarFallback(e: unknown): boolean {
  if (!(e instanceof OpenAiError)) return false;
  if (e.timeout) return true;
  return e.status === 429 || (e.status != null && e.status >= 500);
}

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(model.trim());
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: unknown };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: string };
};

/** Corpo compatível: gpt-5* usa max_completion_tokens e não aceita temperature ≠ 1. */
export function buildChatBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
  };
  if (req.responseFormat) body.response_format = req.responseFormat;
  if (isReasoningModel(req.model)) {
    body.max_completion_tokens = req.maxTokens ?? 1600;
  } else {
    if (req.temperature != null) body.temperature = req.temperature;
    body.max_tokens = req.maxTokens ?? 1200;
  }
  return body;
}

export function extractChatText(data: unknown): string {
  const d = data as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const raw = d.choices?.[0]?.message?.content;
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    return raw.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
  }
  return '';
}

export async function openaiChat(
  key: string,
  req: ChatRequest,
  opts?: { timeoutMs?: number; signal?: AbortSignal; fallback?: string },
): Promise<{ texto: string; modelo: string; fallback_usado: boolean }> {
  const timeoutMs = opts?.timeoutMs ?? 22_000;
  const run = async (model: string, ms: number) => {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts?.signal?.addEventListener('abort', onAbort);
    let expirou = false;
    const timer = setTimeout(() => {
      expirou = true;
      ctrl.abort();
    }, ms);
    try {
      let r: Response;
      let raw: string;
      try {
        r = await fetch(OPENAI_CHAT_URL, {
          signal: ctrl.signal,
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildChatBody({ ...req, model })),
        });
        raw = await r.text();
      } catch (e) {
        if (expirou) throw new OpenAiError('OpenAI timeout (aborted)', null, true);
        throw e;
      }
      if (!r.ok) throw new OpenAiError(`OpenAI ${r.status}: ${raw.slice(0, 240)}`, r.status);
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Resposta OpenAI inválida.');
      }
      const texto = extractChatText(data);
      if (!texto) throw new Error('Resposta vazia da IA.');
      return texto;
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener('abort', onAbort);
    }
  };

  try {
    const texto = await run(req.model, timeoutMs);
    return { texto, modelo: req.model, fallback_usado: false };
  } catch (e) {
    const fb = opts?.fallback;
    if (!fb || fb === req.model || !deveTentarFallback(e)) throw e;
    const texto = await run(fb, Math.min(12_000, timeoutMs));
    return { texto, modelo: fb, fallback_usado: true };
  }
}
