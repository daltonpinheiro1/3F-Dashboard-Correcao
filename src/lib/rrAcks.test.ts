import { describe, expect, it } from 'vitest';
import { alertStableId, buildAck, slaRestanteMin, slaStatus, SLA_MIN } from './rrAcks';

describe('rrAcks', () => {
  it('SLA crítico 30 min / alto 60', () => {
    expect(SLA_MIN.critico).toBe(30);
    expect(SLA_MIN.alto).toBe(60);
  });

  it('status aberto / no prazo / vencido', () => {
    const now = new Date('2026-08-31T15:00:00.000Z');
    const ack = buildAck({
      alertId: 'gap_meta',
      dataRef: '2026-08-31',
      campanha: 'TODAS',
      ownerEmail: 'a@3f.com',
      ownerName: 'Ana',
      slaMin: 30,
      now,
    });
    expect(slaStatus(undefined, now.getTime())).toBe('aberto');
    expect(slaStatus(ack, now.getTime() + 10 * 60_000)).toBe('no_prazo');
    expect(slaStatus(ack, now.getTime() + 31 * 60_000)).toBe('vencido');
    expect(slaRestanteMin(ack, now.getTime() + 10 * 60_000)).toBe(20);
    expect(alertStableId('2026-08-31', 'TODAS', 'gap_meta')).toBe('2026-08-31|TODAS|gap_meta');
  });
});
