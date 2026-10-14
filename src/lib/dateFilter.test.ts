import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultDateRange, getMonthRange, getWeekRange, getYesterdayRange, periodoCompleto, periodoInicial,
} from './dateFilter';

describe('dateFilter BRT', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa calendário America/Sao_Paulo, não UTC do browser', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T02:30:00.000Z')); // 23:30 BRT de 31/08
    expect(getDefaultDateRange()).toEqual({ dateFrom: '2026-08-31', dateTo: '2026-08-31' });
    expect(getYesterdayRange()).toEqual({ dateFrom: '2026-08-30', dateTo: '2026-08-30' });
    expect(getWeekRange()).toEqual({ dateFrom: '2026-08-24', dateTo: '2026-08-30' });
    expect(getMonthRange()).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });
  });
});

describe('período compartilhado', () => {
  const hoje = { dateFrom: '2026-10-14', dateTo: '2026-10-14' };
  const mes = { dateFrom: '2026-10-01', dateTo: '2026-10-14' };

  it('sem escolha anterior, cada aba abre no próprio padrão', () => {
    expect(periodoInicial(hoje, null)).toEqual(hoje);
    expect(periodoInicial(mes, null)).toEqual(mes);
  });

  it('período escolhido numa aba vale nas outras', () => {
    const escolhido = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
    expect(periodoInicial(hoje, escolhido)).toEqual(escolhido);
    expect(periodoInicial(mes, escolhido)).toEqual(escolhido);
  });

  it('deep link da URL vence o compartilhado', () => {
    const escolhido = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
    expect(periodoInicial(mes, escolhido, { dateFrom: '2026-10-02', dateTo: '2026-10-03' }))
      .toEqual({ dateFrom: '2026-10-02', dateTo: '2026-10-03' });
  });

  it('período incompleto ou invertido não é reaproveitado', () => {
    expect(periodoCompleto({ dateFrom: '', dateTo: '2026-10-01' })).toBe(false);
    expect(periodoCompleto({ dateFrom: '2026-10-02', dateTo: '2026-10-01' })).toBe(false);
    expect(periodoCompleto({ dateFrom: '2026-13-01', dateTo: '2026-13-02' })).toBe(false);
    expect(periodoInicial(mes, { dateFrom: '', dateTo: '2026-10-01' })).toEqual(mes);
  });
});
