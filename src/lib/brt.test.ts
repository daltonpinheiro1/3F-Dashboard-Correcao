import { describe, expect, it } from 'vitest';
import { dataBrtIso, dataRefEva, horaBrt, isAbortError, mesBrt, parseEvaBrtMs, shiftIsoDay, startOfBrtDayIso } from './brt';

describe('BRT America/Sao_Paulo', () => {
  it('meia-noite UTC ainda é véspera em BRT', () => {
    const d = new Date('2026-09-01T02:30:00.000Z');
    expect(dataBrtIso(d)).toBe('2026-08-31');
    expect(horaBrt(d)).toBe('23');
    expect(mesBrt(d)).toBe('2026-08');
  });

  it('meio-dia UTC é 09h BRT', () => {
    const d = new Date('2026-08-31T12:00:00.000Z');
    expect(dataBrtIso(d)).toBe('2026-08-31');
    expect(horaBrt(d)).toBe('09');
  });

  it('início do dia BRT é 03:00Z', () => {
    const iso = startOfBrtDayIso(new Date('2026-08-31T18:00:00.000Z'));
    expect(iso).toBe('2026-08-31T03:00:00.000Z');
  });

  it('dataRefEva prefere payload.data', () => {
    expect(dataRefEva({ data: '2026-08-30', updated_at: '2026-08-31T12:00:00Z' })).toBe('2026-08-30');
  });

  it('dataRefEva converte updated_at UTC para calendário BRT', () => {
    expect(dataRefEva({ updated_at: '2026-09-01T02:30:00.000Z' })).toBe('2026-08-31');
  });

  it('parseEvaBrtMs trata timestamp sem fuso como BRT', () => {
    expect(parseEvaBrtMs('2026-08-24T12:28:00')).toBe(new Date('2026-08-24T12:28:00-03:00').getTime());
    expect(parseEvaBrtMs('2026-08-24 12:28:00')).toBe(new Date('2026-08-24T12:28:00-03:00').getTime());
    expect(parseEvaBrtMs('2026-09-01T02:30:00.000Z')).toBe(new Date('2026-09-01T02:30:00.000Z').getTime());
  });

  it('isAbortError', () => {
    expect(isAbortError({ name: 'AbortError', message: 'Aborted' })).toBe(true);
    expect(isAbortError(new Error('fail'))).toBe(false);
  });
});

describe('shiftIsoDay', () => {
  it('cruza mês', () => {
    expect(shiftIsoDay('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftIsoDay('2026-08-31', -7)).toBe('2026-08-24');
  });
});
