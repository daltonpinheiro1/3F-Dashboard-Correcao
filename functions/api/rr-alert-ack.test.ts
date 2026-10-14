import { describe, expect, it } from 'vitest';
import { resolverSlaUntil } from './rr-alert-ack';

const agora = Date.parse('2026-10-14T15:00:00.000Z');

describe('resolverSlaUntil', () => {
  it('sem slaUntil usa slaMin 30|60 (padrão 60)', () => {
    expect(resolverSlaUntil(undefined, 30, agora)).toBe('2026-10-14T15:30:00.000Z');
    expect(resolverSlaUntil(undefined, 999, agora)).toBe('2026-10-14T16:00:00.000Z');
  });

  it('slaUntil no passado ou inválido cai no padrão', () => {
    expect(resolverSlaUntil('2026-10-13T10:00:00.000Z', 60, agora)).toBe('2026-10-14T16:00:00.000Z');
    expect(resolverSlaUntil('2026-10-14T15:00:00.000Z', 30, agora)).toBe('2026-10-14T15:30:00.000Z');
    expect(resolverSlaUntil('2026-99-99Tlixo', 60, agora)).toBe('2026-10-14T16:00:00.000Z');
  });

  it('slaUntil futuro é aceito e limitado a 7 dias', () => {
    expect(resolverSlaUntil('2026-10-15T09:00:00.000Z', 60, agora)).toBe('2026-10-15T09:00:00.000Z');
    expect(resolverSlaUntil('2027-01-01T00:00:00.000Z', 60, agora)).toBe('2026-10-21T15:00:00.000Z');
  });
});
