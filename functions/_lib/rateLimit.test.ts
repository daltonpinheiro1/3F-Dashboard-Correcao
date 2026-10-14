import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult } from './auth';
import {
  allowRateDistributed,
  allowRateForUser,
  FALLBACK_MAX_KEYS,
  rateLimitFallbackSize,
  rateLimitSubject,
  resetRateLimitFallback,
} from './rateLimit';

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

  it('remove chaves expiradas do fallback na varredura periódica', async () => {
    resetRateLimitFallback();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    for (let i = 0; i < 50; i += 1) {
      await allowRateDistributed(undefined, `10.0.0.${i}`, 'sweep', 1_000, 5);
    }
    expect(rateLimitFallbackSize()).toBe(50);

    vi.setSystemTime(new Date('2026-10-14T12:01:01Z'));
    await allowRateDistributed(undefined, '10.9.9.9', 'sweep', 1_000, 5);
    expect(rateLimitFallbackSize()).toBe(1);
  });

  it('mantém chaves ainda dentro da janela na varredura', async () => {
    resetRateLimitFallback();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    await allowRateDistributed(undefined, '10.1.1.1', 'janela-longa', 15 * 60_000, 1);
    vi.setSystemTime(new Date('2026-10-14T12:02:00Z'));
    await allowRateDistributed(undefined, '10.1.1.2', 'janela-longa', 15 * 60_000, 1);
    expect(rateLimitFallbackSize()).toBe(2);
    await expect(
      allowRateDistributed(undefined, '10.1.1.1', 'janela-longa', 15 * 60_000, 1),
    ).resolves.toBe(false);
  });

  it('limita o número de chaves do fallback descartando as menos recentes', async () => {
    resetRateLimitFallback();
    for (let i = 0; i < FALLBACK_MAX_KEYS + 25; i += 1) {
      await allowRateDistributed(undefined, `k${i}`, 'cap', 60_000, 5);
    }
    expect(rateLimitFallbackSize()).toBe(FALLBACK_MAX_KEYS);
    await expect(allowRateDistributed(undefined, `k${FALLBACK_MAX_KEYS + 24}`, 'cap', 60_000, 1)).resolves.toBe(false);
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

describe.sequential('rate limit por usuário', () => {
  const req = (ip = '203.0.113.7') =>
    new Request('https://dash.test/api/x', { headers: { 'cf-connecting-ip': ip } });
  const sessao = (id: string, email = 'a@3f.test'): AuthResult => ({
    ok: true,
    mode: 'session',
    user: { id, email, role: 'viewer' },
  });

  it('rateLimitSubject prioriza id, depois email, depois IP', () => {
    expect(rateLimitSubject(req(), sessao('uuid-1'))).toBe('u:uuid-1');
    expect(rateLimitSubject(req(), sessao('', ' A@3F.test '))).toBe('e:a@3f.test');
    expect(rateLimitSubject(req(), { ok: true, mode: 'secret' })).toBe('ip:203.0.113.7');
    expect(rateLimitSubject(req(), { ok: false, status: 401, error: 'x' })).toBe('ip:203.0.113.7');
    expect(rateLimitSubject(req(), null)).toBe('ip:203.0.113.7');
  });

  it('limita o mesmo usuário em IPs diferentes e não afeta colegas no mesmo IP', async () => {
    const bucket = `user-${Math.random()}`;
    const alvo = sessao('uuid-alvo');
    await expect(allowRateForUser(undefined, req('198.51.100.1'), alvo, bucket, 60_000, 2)).resolves.toBe(true);
    await expect(allowRateForUser(undefined, req('198.51.100.2'), alvo, bucket, 60_000, 2)).resolves.toBe(true);
    await expect(allowRateForUser(undefined, req('198.51.100.3'), alvo, bucket, 60_000, 2)).resolves.toBe(false);
    await expect(
      allowRateForUser(undefined, req('198.51.100.1'), sessao('uuid-colega'), bucket, 60_000, 2),
    ).resolves.toBe(true);
  });

  it('usa a chave do usuário no KV e no binding nativo', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => undefined);
    const kv = { get, put } as unknown as KVNamespace;
    await expect(
      allowRateForUser({ RATE_LIMIT: kv, RATE_LIMIT_AI: { limit } }, req(), sessao('uuid-9'), 'copilot', 60_000, 10),
    ).resolves.toBe(true);
    expect(limit).toHaveBeenCalledWith({ key: 'rl:copilot:u:uuid-9' });
    expect(get).toHaveBeenCalledWith('rl:copilot:u:uuid-9');
  });
});

describe('usaKvNoBucket', () => {
  it('KV só em login e IA; leituras com polling ficam na memória', async () => {
    const { usaKvNoBucket } = await import('./rateLimit');
    expect(usaKvNoBucket('auth-login-ip', 40)).toBe(true);
    expect(usaKvNoBucket('copilot', 40)).toBe(true);
    expect(usaKvNoBucket('rr-insight', 40)).toBe(true);
    expect(usaKvNoBucket('portab-funil', 40)).toBe(false);
    expect(usaKvNoBucket('eva-data', 120)).toBe(false);
  });
});
