import { describe, expect, it } from 'vitest';
import {
  clampMesYm,
  isMesYm,
  janelaRrHorizonte,
  labelMesYm,
  lastIsoDayOfMonth,
  mesesRrRecentes,
} from './rrHorizonte';

describe('rrHorizonte calendário', () => {
  it('realtime é o próprio dia; semanal recua 6 dias', () => {
    expect(janelaRrHorizonte('2026-09-08', 'realtime')).toEqual({
      from: '2026-09-08',
      to: '2026-09-08',
      pedidoDias: 1,
      maxDias: 1,
    });
    const q = janelaRrHorizonte('2026-09-08', 'quinzenal');
    expect(q.from).toBe('2026-08-25');
    expect(q.maxDias).toBe(15);
  });

  it('mensal é o mês calendário, não 30 dias rolantes', () => {
    const atual = janelaRrHorizonte('2026-09-08', 'mensal');
    expect(atual.from).toBe('2026-09-01');
    expect(atual.to).toBe('2026-09-08');
    expect(atual.pedidoDias).toBe(8);
    expect(atual.maxDias).toBe(31);

    const ago = janelaRrHorizonte('2026-09-08', 'mensal', '2026-08');
    expect(ago.from).toBe('2026-08-01');
    expect(ago.to).toBe('2026-08-31');
    expect(ago.pedidoDias).toBe(31);
  });

  it('não deixa escolher mês futuro', () => {
    const fut = janelaRrHorizonte('2026-09-08', 'mensal', '2026-10');
    expect(fut.from).toBe('2026-09-01');
    expect(fut.to).toBe('2026-09-08');
    expect(clampMesYm('2026-10', '2026-09')).toBe('2026-09');
  });

  it('label e lista de meses', () => {
    expect(isMesYm('2026-08')).toBe(true);
    expect(lastIsoDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(labelMesYm('2026-09')).toBe('set/2026');
    expect(mesesRrRecentes('2026-09', 3)).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('semestral recua com teto de 90 snapshots', () => {
    const y = janelaRrHorizonte('2026-09-08', 'semestral');
    expect(y.maxDias).toBe(90);
    expect(y.pedidoDias).toBe(180);
  });
});
