import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowRateDistributed } from './rateLimit';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.sequential('allowRateDistributed', () => {
  it('limita por bucket no fallback em memória', async () => {
    const bucket = `fallback-${Math.random()}`;

    await expect(allowRateDistributed(undefined, '127.0.0.1', bucket, 60_000, 2)).resolves.toBe(true);
    await expect(allowRateDistributed(undefined, '127.0.0.1', bucket, 60_000, 2)).resolves.toBe(true);
    await expect(allowRateDistributed(undefined, '127.0.0.1', bucket, 60_000, 2)).resolves.toBe(false);
  });

  it('descarta hits expirados no KV e persiste o hit atual', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const now = Date.now();
    const get = vi.fn(async () => JSON.stringify([now - 60_001, now - 1_000]));
    const put = vi.fn(async () => undefined);
    const kv = { get, put } as unknown as KVNamespace;

    await expect(
      allowRateDistributed({ RATE_LIMIT: kv }, '203.0.113.10', 'copilot', 60_000, 2),
    ).resolves.toBe(true);
    expect(put).toHaveBeenCalledWith(
      'rl:copilot:203.0.113.10',
      JSON.stringify([now - 1_000, now]),
      { expirationTtl: 65 },
    );
  });

  it('nega no limite distribuído sem adicionar outro hit', async () => {
    const hits = [Date.now() - 2_000, Date.now() - 1_000];
    const get = vi.fn(async () => JSON.stringify(hits));
    const put = vi.fn(async () => undefined);
    const kv = { get, put } as unknown as KVNamespace;

    await expect(
      allowRateDistributed({ RATE_LIMIT: kv }, '198.51.100.2', 'auth', 60_000, 2),
    ).resolves.toBe(false);
    expect(put).toHaveBeenCalledWith(
      'rl:auth:198.51.100.2',
      JSON.stringify(hits),
      { expirationTtl: 65 },
    );
  });

  it('nega imediatamente quando o binding nativo bloqueia', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    await expect(
      allowRateDistributed(
        { RATE_LIMIT_AUTH: { limit } },
        '192.0.2.2',
        'auth-login',
        60_000,
        12,
      ),
    ).resolves.toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: 'rl:auth-login:192.0.2.2' });
  });

  it('mantém fallback quando o binding nativo falha', async () => {
    const bucket = `native-fallback-${Math.random()}`;
    const limit = vi.fn(async () => {
      throw new Error('binding offline');
    });
    await expect(
      allowRateDistributed({ RATE_LIMIT_AI: { limit } }, '192.0.2.3', bucket, 60_000, 1),
    ).resolves.toBe(true);
    await expect(
      allowRateDistributed({ RATE_LIMIT_AI: { limit } }, '192.0.2.3', bucket, 60_000, 1),
    ).resolves.toBe(false);
  });
});
