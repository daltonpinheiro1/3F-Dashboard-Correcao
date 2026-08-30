/** Rate limit distribuído via KV (Cloudflare) com fallback in-memory por isolate. */

export type RateLimitEnv = {
  RATE_LIMIT?: KVNamespace;
};

const fallbackHits = new Map<string, number[]>();

export async function allowRateDistributed(
  env: RateLimitEnv | undefined,
  ip: string,
  bucket: string,
  windowMs = 60_000,
  max = 40,
): Promise<boolean> {
  const key = `rl:${bucket}:${ip}`;
  const now = Date.now();

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
