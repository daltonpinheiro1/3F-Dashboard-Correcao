/**
 * POST /api/rr-insight — briefing executivo RR em markdown (nunca JSON).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireRr,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, allowRateForUser, type RateLimitEnv } from '../_lib/rateLimit';
import { modelWorkhorse, openaiChat, type OpenAiModelEnv } from '../_lib/openaiModels';
import { insightUserText, sanitizarBriefingRr } from '../_lib/rrBriefing';

const MAX_BODY = 80_000;
const CACHE_TTL_S = 600;
const CACHE_MEM_MAX = 200;
const CACHE_PREFIX = 'rr-insight:v1:';

type Env = EnvAuth &
  RateLimitEnv &
  OpenAiModelEnv & { OPENAI_API_KEY?: string; RR_INSIGHT_CACHE?: KVNamespace };

type Cached = { texto: string; modelo: string };

const memCache = new Map<string, { exp: number; value: Cached }>();

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cacheKv(env: Env): KVNamespace | undefined {
  return env.RR_INSIGHT_CACHE ?? env.RATE_LIMIT;
}

async function cacheGet(env: Env, hash: string): Promise<Cached | null> {
  const kv = cacheKv(env);
  if (kv) {
    try {
      const raw = await kv.get(CACHE_PREFIX + hash);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Cached>;
        if (typeof v.texto === 'string' && v.texto) return { texto: v.texto, modelo: String(v.modelo || '') };
      }
    } catch {
      /* KV indisponível: cai no cache em memória */
    }
  }
  const hit = memCache.get(hash);
  if (!hit) return null;
  if (Date.now() >= hit.exp) {
    memCache.delete(hash);
    return null;
  }
  return hit.value;
}

async function cachePut(env: Env, hash: string, value: Cached): Promise<void> {
  const kv = cacheKv(env);
  if (kv) {
    try {
      await kv.put(CACHE_PREFIX + hash, JSON.stringify(value), { expirationTtl: CACHE_TTL_S });
      return;
    } catch {
      /* KV indisponível: cai no cache em memória */
    }
  }
  if (memCache.size >= CACHE_MEM_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(hash, { exp: Date.now() + CACHE_TTL_S * 1000, value });
}

const SYSTEM =
  'Você é o briefing da reunião de resultado (RR) 3F Telecom, estilo Amazon WBR. ' +
  'Português, tom de comitê, sem enrolação. ' +
  'O usuário já descreveu os números em texto. NÃO copie JSON. NÃO abra chave. NÃO use code fence. ' +
  'Resposta SOMENTE em markdown, nestas seções:\n\n' +
  '## Situação\n(2 linhas)\n' +
  '## De onde veio o gap\n- ...\n' +
  '## Oportunidades menores\n- impacto = vendas já medidas, sem elasticidade\n' +
  '## 3 ações\n1. owner + prazo\n' +
  '## Risco\n(1 bullet)\n\n' +
  'Não invente números. Não recálcule CPC/DROP/TMA. Se o recorte não tem Gross, não cite Gross. ' +
  'Todas = Port+Mig; BKO/Algar/Ctrl não entram em Todas.';

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'rr-insight', 60_000, 6))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requireRr(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await allowRateForUser(context.env, context.request, auth, 'rr-insight-user', 60_000, 6))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Payload grande demais.' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const user = insightUserText(payload);
  if (!user) return json({ error: 'Payload vazio.' }, 400);

  const model = modelWorkhorse(context.env);
  const hash = await sha256Hex(`${model}\n${SYSTEM}\n${user}`);
  const cached = await cacheGet(context.env, hash);
  if (cached) return json({ ...cached, cache: true });

  try {
    const chat = await openaiChat(
      key,
      {
        model,
        temperature: 0.2,
        maxTokens: 900,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      },
      { timeoutMs: 22_000 },
    );
    const texto = sanitizarBriefingRr(chat.texto);
    if (!texto) return json({ error: 'A IA devolveu JSON vazio. Tente de novo.' }, 502);
    await cachePut(context.env, hash, { texto, modelo: chat.modelo });
    return json({ texto, modelo: chat.modelo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /abort/i.test(msg) ? 'Timeout na IA (22s).' : 'Falha no briefing.' }, 502);
  }
}
