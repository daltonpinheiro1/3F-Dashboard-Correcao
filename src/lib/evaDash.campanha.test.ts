import { describe, expect, it } from 'vitest';
import { CAMPANHA_FILTRO_OPTIONS, classificarCampanha, labelCampanhaOp, matchCampanha } from './evaDash';

describe('campanha Ação BKO', () => {
  it('classificarCampanha reconhece BKO antes de portabilidade', () => {
    expect(classificarCampanha('04 - TIM ACAO BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('fila backoffice')).toBe('ACAO_BKO');
    expect(classificarCampanha('PORTABILIDADE BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('03 - TIM PORTABILIDADE RECEPTIVO')).toBe('PORTABILIDADE');
    expect(classificarCampanha('PRE CONTROLE')).toBe('MIGRACAO');
  });

  it('matchCampanha filtra ACAO_BKO', () => {
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'PORTABILIDADE')).toBe(false);
    expect(matchCampanha({ campaign_name: 'ação bko' }, 'ACAO_BKO')).toBe(true);
  });

  it('CAMPANHA_FILTRO_OPTIONS inclui Ação BKO', () => {
    expect(CAMPANHA_FILTRO_OPTIONS.map((o) => o.id)).toContain('ACAO_BKO');
    expect(labelCampanhaOp('ACAO_BKO')).toBe('Ação BKO');
  });
});
