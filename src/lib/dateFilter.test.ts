import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultDateRange, getMonthRange, getWeekRange, getYesterdayRange } from './dateFilter';

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
