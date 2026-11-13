import { describe, expect, it } from 'vitest';
import { explainScoreOutcome, splitOutcomeCodes } from './scoreTimExplain';

describe('scoreTimExplain', () => {
  it('parte composto PERFIL_PRE_PAGO+RESTRICAO_MERCADO', () => {
    const atoms = splitOutcomeCodes('PERFIL_PRE_PAGO+RESTRICAO_MERCADO');
    expect(atoms).toEqual(['PERFIL_PRE_PAGO', 'RESTRICAO_MERCADO']);
    const { factors, headline } = explainScoreOutcome({
      status: 'REJECTED',
      outcome_code: 'PERFIL_PRE_PAGO+RESTRICAO_MERCADO',
    });
    expect(factors).toHaveLength(2);
    expect(factors[0].title).toMatch(/pré-pago/i);
    expect(factors[1].title).toMatch(/restrição/i);
    expect(headline).toMatch(/pré-pago/i);
  });

  it('cadastral traz CTA', () => {
    const { factors } = explainScoreOutcome({
      status: 'REJECTED',
      outcome_code: 'NOME_MAE_DIVERGENTE',
    });
    expect(factors[0].cta).toMatch(/mãe/i);
  });

  it('APPROVED sem código usa SCORE_APROVADO', () => {
    const { factors } = explainScoreOutcome({ status: 'APPROVED' });
    expect(factors[0].code).toBe('SCORE_APROVADO');
  });

  it('fallback seguro para código desconhecido', () => {
    const { factors } = explainScoreOutcome({
      status: 'REJECTED',
      outcome_code: 'CODIGO_NOVO_XYZ',
      rejection_reason: 'Motivo custom',
    });
    expect(factors[0].detail).toContain('Motivo custom');
  });
});
