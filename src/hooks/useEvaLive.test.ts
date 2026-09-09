import { describe, expect, it } from 'vitest';
import { isLiveStale, liveAgeMs, LIVE_STALE_MS } from './useEvaLive';
import type { EvaPayload } from '../lib/evaDash';

const payload = (updated_at: string) => ({ updated_at }) as EvaPayload;

describe('idade do live EVA', () => {
  it('interpreta timestamp sem fuso como BRT', () => {
    const now = Date.parse('2026-09-09T15:10:00.000Z');
    expect(liveAgeMs(payload('2026-09-09T12:00:00'), now)).toBe(10 * 60_000);
  });

  it('usa o mesmo limiar de stale de 8 minutos', () => {
    const now = Date.now();
    expect(isLiveStale(payload(new Date(now - LIVE_STALE_MS + 1000).toISOString()))).toBe(false);
    expect(isLiveStale(payload(new Date(now - LIVE_STALE_MS - 1000).toISOString()))).toBe(true);
  });
});
