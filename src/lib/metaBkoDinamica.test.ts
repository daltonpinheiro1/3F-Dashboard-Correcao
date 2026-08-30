import { describe, expect, it } from 'vitest';
import { resolveBkoRefs, resolveMetaCpcEfetiva } from './metaBkoDinamica';

describe('metaBkoDinamica', () => {
  it('usa media do dia quando ha volume', () => {
    const refs = resolveBkoRefs({
      serieBko: [
        { hora: '09', total: 20, cpc: 8, sucesso: 2, campanha_op: 'ACAO_BKO' },
        { hora: '10', total: 20, cpc: 8, sucesso: 3, campanha_op: 'ACAO_BKO' },
        { hora: '11', total: 20, cpc: 8, sucesso: 2, campanha_op: 'ACAO_BKO' },
      ],
      metaDiaStore: 40,
      dataRef: '2026-08-28',
      horaAtual: '11',
    });
    expect(refs.metaCpcFonte).toBe('media_dia');
    expect(refs.metaCpc).toBe(40); // 24/60
    expect(refs.limiarAlertaCpc).toBe(34); // 40 * 0.85
    expect(refs.expedienteHoras).toBeGreaterThanOrEqual(3);
  });

  it('cai na media da semana sem volume no dia', () => {
    const refs = resolveBkoRefs({
      serieBko: [],
      weekHist: [
        { vendas: 10, cpc: 30 },
        { vendas: 12, cpc: 32 },
      ],
      metaDiaStore: 40,
      dataRef: '2026-08-28',
      horaAtual: '10',
    });
    expect(refs.metaCpcFonte).toBe('media_semana');
    expect(refs.metaCpc).toBe(31);
    expect(refs.metaVendasDia).toBe(11);
  });

  it('resolveMetaCpcEfetiva so aplica limiar em BKO', () => {
    const refs = resolveBkoRefs({
      serieBko: [{ hora: '09', total: 20, cpc: 10, sucesso: 1, campanha_op: 'ACAO_BKO' }],
      metaDiaStore: 40,
      dataRef: '2026-08-28',
    });
    expect(resolveMetaCpcEfetiva('ACAO_BKO', 40, refs)).toBe(refs.limiarAlertaCpc);
    expect(resolveMetaCpcEfetiva('PORTABILIDADE', 40, refs)).toBe(40);
  });
});
