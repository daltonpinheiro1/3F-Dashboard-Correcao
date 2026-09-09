/** Rate limit distribuído via KV (Cloudflare) com fallback in-memory por isolate. */

export type RateLimitEnv = {
  RATE_LIMIT?: KVNamespace;
  RATE_LIMIT_AUTH?: NativeRateLimiter;
  RATE_LIMIT_AI?: NativeRateLimiter;
  RATE_LIMIT_READ?: NativeRateLimiter;
};

export type NativeRateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

const fallbackHits = new Map<string, number[]>();

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

  const fbKey = `${bucket}:${ip}`;
  const arr = (fallbackHits.get(fbKey) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    fallbackHits.set(fbKey, arr);
    return false;
  }
  arr.push(now);
  fallbackHits.set(fbKey, arr);
  return true;
}
