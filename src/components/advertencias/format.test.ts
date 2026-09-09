import { describe, expect, it } from 'vitest';
import { fmtDate, fmtDateTime, periodoSuspensaoBrt } from './format';

describe('datas de advertências em BRT', () => {
  it('não desloca uma data de calendário', () => {
    expect(fmtDate('2026-09-09')).toBe('09/09/2026');
  });

  it('formata timestamps no horário de São Paulo', () => {
    expect(fmtDateTime('2026-09-09T03:30:00Z')).toContain('09/09/2026');
  });

  it('calcula suspensão em dias inclusivos do calendário BRT', () => {
    expect(periodoSuspensaoBrt('2026-09-09T02:30:00Z', 1)).toBe('08/09/2026');
    expect(periodoSuspensaoBrt('2026-09-09T03:30:00Z', 3)).toBe(
      '09/09/2026 a 11/09/2026',
    );
  });
});
