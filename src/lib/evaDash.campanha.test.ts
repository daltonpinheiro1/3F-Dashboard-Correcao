import { describe, expect, it } from 'vitest';
import {
  CAMPANHA_FILTRO_OPTIONS,
  classificarCampanha,
  labelCampanhaOp,
  matchCampanha,
  matchCampanhaComercial,
  isizeGlobalAplicavel,
  normalizeEvaCampanhas,
} from './evaDash';

describe('campanha Ação BKO', () => {
  it('classificarCampanha reconhece BKO antes de portabilidade', () => {
    expect(classificarCampanha('04 - TIM ACAO BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('fila backoffice')).toBe('ACAO_BKO');
    expect(classificarCampanha('PORTABILIDADE BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('03 - TIM PORTABILIDADE RECEPTIVO')).toBe('PORTABILIDADE');
    expect(classificarCampanha('PRE CONTROLE')).toBe('MIGRACAO');
  });

  it('matchCampanhaComercial em TODAS exclui BKO', () => {
    expect(matchCampanhaComercial({ campanha_op: 'PORTABILIDADE' }, 'TODAS')).toBe(true);
    expect(matchCampanhaComercial({ campanha_op: 'MIGRACAO' }, 'TODAS')).toBe(true);
    expect(matchCampanhaComercial({ campanha_op: 'ACAO_BKO' }, 'TODAS')).toBe(false);
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'TODAS')).toBe(true);
    expect(matchCampanhaComercial({ campanha_op: 'ACAO_BKO' }, 'ACAO_BKO')).toBe(true);
    expect(isizeGlobalAplicavel('TODAS')).toBe(true);
    expect(isizeGlobalAplicavel('PORTABILIDADE')).toBe(true);
    expect(isizeGlobalAplicavel('MIGRACAO')).toBe(false);
    expect(isizeGlobalAplicavel('ACAO_BKO')).toBe(false);
  });

  it('matchCampanha filtra ACAO_BKO', () => {
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'PORTABILIDADE')).toBe(false);
    expect(matchCampanha({ campaign_name: 'ação bko' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', campaign_name: 'TIM ACAO BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', campaign_name: 'Backoffice' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', queue_name: 'AÇÃO BKO' }, 'ACAO_BKO')).toBe(true);
  });

  it('normalizeEvaCampanhas promove Backoffice e série OUTROS', () => {
    const p = normalizeEvaCampanhas({
      updated_at: 'x',
      data: '2026-08-29',
      jornada: [{ login: '10144', campaign_name: 'Backoffice', campanha_op: 'OUTROS' }],
      ranking_operadores: [{ login: '10144', campaign_name: 'Backoffice', campanha_op: 'OUTROS', total: 1 }],
      serie_hora: [{ hora: '10', campanha_op: 'OUTROS', total: 5, cpc: 1, sucesso: 0, pct_cpc: 20 }],
      ofensores_tab: [{ login: '10144', nome: 'QUEDA', campanha_op: 'OUTROS', total: 2 }],
      discagens: {
        kpis: { dialed: 0, contact: 0, tabuladas: 0, cpc: 0, sucesso: 0 },
        por_campanha: [{ campanha_op: 'OUTROS', dialed: 10, contact: 1, tabuladas: 1, cpc: 0, sucesso: 0 }],
      },
    } as unknown as Parameters<typeof normalizeEvaCampanhas>[0]);
    expect(p.jornada?.[0]?.campanha_op).toBe('ACAO_BKO');
    expect(p.serie_hora?.[0]?.campanha_op).toBe('ACAO_BKO');
    expect(p.ofensores_tab?.[0]?.campanha_op).toBe('ACAO_BKO');
    expect(p.discagens?.por_campanha?.[0]?.campanha_op).toBe('ACAO_BKO');
  });

  it('CAMPANHA_FILTRO_OPTIONS inclui Ação BKO', () => {
    expect(CAMPANHA_FILTRO_OPTIONS.map((o) => o.id)).toContain('ACAO_BKO');
    expect(labelCampanhaOp('ACAO_BKO')).toBe('Ação BKO');
  });
});
