import { describe, expect, it } from 'vitest';
import { somarRankingSms } from './smsRanking';

describe('somarRankingSms', () => {
  it('soma exatamente as linhas exibidas', () => {
    const s = somarRankingSms([
      { total: 10, com_sms: 6, sem_sms: 4, sucesso_com_sms: 3, sucesso_sem_sms: 1 },
      { total: 5, com_sms: 2, sem_sms: 2, sucesso_com_sms: 1, sucesso_sem_sms: 0 },
    ]);
    expect(s).toMatchObject({ linhas: 2, total: 15, com_sms: 8, sem_sms: 6, sucesso_com_sms: 4, sucesso_sem_sms: 1 });
    expect(s.taxa_sms).toBeCloseTo((8 / 15) * 100, 6);
    expect(s.pct_sucesso_com).toBe(50);
    expect(s.pct_sucesso_sem).toBeCloseTo((1 / 6) * 100, 6);
  });

  it('sem linhas zera sem dividir por zero', () => {
    expect(somarRankingSms([])).toEqual({
      linhas: 0, total: 0, com_sms: 0, sem_sms: 0, sucesso_com_sms: 0, sucesso_sem_sms: 0,
      taxa_sms: 0, pct_sucesso_com: 0, pct_sucesso_sem: 0,
    });
  });
});
