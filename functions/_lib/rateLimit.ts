/** Rate limit distribuído via KV (Cloudflare) com fallback in-memory por isolate. */

import { clientIp, type AuthResult } from './auth';

export type RateLimitEnv = {
  RATE_LIMIT?: KVNamespace;
  RATE_LIMIT_AUTH?: NativeRateLimiter;
  RATE_LIMIT_AI?: NativeRateLimiter;
  RATE_LIMIT_READ?: NativeRateLimiter;
};

export type NativeRateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type FallbackEntry = { hits: number[]; windowMs: number };

const fallbackHits = new Map<string, FallbackEntry>();
const FALLBACK_SWEEP_MS = 60_000;
export const FALLBACK_MAX_KEYS = 10_000;
let lastSweep = 0;

function sweepFallback(now: number) {
  if (now - lastSweep >= FALLBACK_SWEEP_MS) {
    lastSweep = now;
    for (const [key, entry] of fallbackHits) {
      const newest = entry.hits[entry.hits.length - 1] ?? 0;
      if (now - newest >= entry.windowMs) fallbackHits.delete(key);
    }
  }
  // Map preserva ordem de inserção e cada acesso reinsere a chave: as primeiras são as menos recentes.
  for (const key of fallbackHits.keys()) {
    if (fallbackHits.size < FALLBACK_MAX_KEYS) break;
    fallbackHits.delete(key);
  }
}

function allowFallback(fbKey: string, now: number, windowMs: number, max: number): boolean {
  sweepFallback(now);
  const hits = (fallbackHits.get(fbKey)?.hits || []).filter((t) => now - t < windowMs);
  fallbackHits.delete(fbKey);
  if (hits.length >= max) {
    fallbackHits.set(fbKey, { hits, windowMs });
    return false;
  }
  hits.push(now);
  fallbackHits.set(fbKey, { hits, windowMs });
  return true;
}

export function rateLimitFallbackSize(): number {
  return fallbackHits.size;
}

export function resetRateLimitFallback(): void {
  fallbackHits.clear();
  lastSweep = 0;
}

function nativeLimiter(env: RateLimitEnv | undefined, bucket: string, max: number) {
  if (!env) return undefined;
  if (bucket.startsWith('auth-')) return env.RATE_LIMIT_AUTH;
  if (
    max <= 12 ||
    /(insight|copilot|what-if|risk-radar|triage|analise|narrativa)/.test(bucket)
  ) {
    return env.RATE_LIMIT_AI;
  }
  return env.RATE_LIMIT_READ;
}

export async function allowRateDistributed(
  env: RateLimitEnv | undefined,
  ip: string,
  bucket: string,
  windowMs = 60_000,
  max = 40,
): Promise<boolean> {
  const key = `rl:${bucket}:${ip}`;
  const now = Date.now();

  const native = nativeLimiter(env, bucket, max);
  if (native) {
    try {
      const result = await native.limit({ key });
      if (!result.success) return false;
    } catch {
      // Binding indisponível: KV/memória continuam protegendo a rota.
    }
  }

  if (env?.RATE_LIMIT) {
    try {
      const raw = await env.RATE_LIMIT.get(key);
      const arr: number[] = raw ? (JSON.parse(raw) as number[]) : [];
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length >= max) {
        await env.RATE_LIMIT.put(key, JSON.stringify(fresh), { expirationTtl: Math.ceil(windowMs / 1000) + 5 });
        return false;
      }
      fresh.push(now);
      await env.RATE_LIMIT.put(key, JSON.stringify(fresh), { expirationTtl: Math.ceil(windowMs / 1000) + 5 });
      return true;
    } catch {
      /* fallback abaixo */
    }
  }

  return allowFallback(`${bucket}:${ip}`, now, windowMs, max);
}

/**
 * Sujeito do rate limit: `u:<id>` da sessão, `e:<email>` se não houver id,
 * `ip:<ip>` para secret/sem sessão.
 */
export function rateLimitSubject(req: Request, auth?: AuthResult | null): string {
  if (auth?.ok && auth.mode === 'session' && auth.user) {
    const id = auth.user.id.trim();
    if (id) return `u:${id}`;
    const email = auth.user.email.trim().toLowerCase();
    if (email) return `e:${email}`;
  }
  return `ip:${clientIp(req)}`;
}

/** Limite por usuário autenticado (IP como fallback). Chamar depois de `authorizeRequest`. */
export function allowRateForUser(
  env: RateLimitEnv | undefined,
  req: Request,
  auth: AuthResult | null | undefined,
  bucket: string,
  windowMs = 60_000,
  max = 40,
): Promise<boolean> {
  return allowRateDistributed(env, rateLimitSubject(req, auth), bucket, windowMs, max);
}
