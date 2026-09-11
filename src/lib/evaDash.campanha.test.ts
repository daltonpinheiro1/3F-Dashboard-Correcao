import { describe, expect, it } from 'vitest';
import {
  CAMPANHA_FILTRO_OPTIONS,
  classificarCampanha,
  labelCampanhaOp,
  matchCampanha,
  matchCampanhaComercial,
  isizeGlobalAplicavel,
  normalizeEvaCampanhas,
  resolveDiscagens,
} from './evaDash';

describe('campanha Ação BKO', () => {
  it('classificarCampanha reconhece BKO antes de portabilidade', () => {
    expect(classificarCampanha('04 - TIM ACAO BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('fila backoffice')).toBe('ACAO_BKO');
    expect(classificarCampanha('PORTABILIDADE BKO')).toBe('ACAO_BKO');
    expect(classificarCampanha('03 - TIM PORTABILIDADE RECEPTIVO')).toBe('PORTABILIDADE');
    expect(classificarCampanha('PRE CONTROLE')).toBe('MIGRACAO');
    expect(classificarCampanha('CONTROLE-CONTROLE')).toBe('CONTROLE_CONTROLE');
    expect(classificarCampanha('CONTROLE - CONTROLE')).toBe('CONTROLE_CONTROLE');
    expect(classificarCampanha('02 - ALGAR PORTABILIDADE PREDITIVO')).toBe('ALGAR');
    expect(classificarCampanha('01 - BANDA LARGA + MOVEL + APPS')).toBe('ALGAR');
    expect(classificarCampanha('03 - ALGAR BKO')).toBe('ALGAR');
    expect(classificarCampanha('02 - MOVEL + APP')).toBe('ALGAR');
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
    expect(isizeGlobalAplicavel('CONTROLE_CONTROLE')).toBe(false);
    expect(isizeGlobalAplicavel('ALGAR')).toBe(false);
    expect(matchCampanhaComercial({ campanha_op: 'CONTROLE_CONTROLE' }, 'TODAS')).toBe(false);
    expect(matchCampanhaComercial({ campanha_op: 'ALGAR' }, 'TODAS')).toBe(false);
    expect(matchCampanha({ campanha_op: 'CONTROLE_CONTROLE' }, 'CONTROLE_CONTROLE')).toBe(true);
    expect(matchCampanha({ campanha_op: 'ALGAR' }, 'ALGAR')).toBe(true);
  });

  it('matchCampanha filtra ACAO_BKO', () => {
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'ACAO_BKO' }, 'PORTABILIDADE')).toBe(false);
    expect(matchCampanha({ campaign_name: 'ação bko' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', campaign_name: 'TIM ACAO BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', campaign_name: 'Backoffice' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'OUTROS', queue_name: 'AÇÃO BKO' }, 'ACAO_BKO')).toBe(true);
    expect(matchCampanha({ campanha_op: 'MIGRACAO', campaign_name: 'CONTROLE-CONTROLE' }, 'CONTROLE_CONTROLE')).toBe(true);
    expect(matchCampanha({ campanha_op: 'MIGRACAO', queue_name: 'CONTROLE - CONTROLE' }, 'CONTROLE_CONTROLE')).toBe(true);
    expect(matchCampanha({ campanha_op: 'MIGRACAO', campaign_name: 'TIM PRE CONTROLE PREDITIVO' }, 'CONTROLE_CONTROLE')).toBe(false);
    expect(matchCampanha({ campanha_op: 'PORTABILIDADE', campaign_name: '02 - ALGAR PORTABILIDADE PREDITIVO' }, 'ALGAR')).toBe(true);
    expect(matchCampanha({ campanha_op: 'ACAO_BKO', queue_name: '03 - ALGAR BKO' }, 'ALGAR')).toBe(true);
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

  it('normalizeEvaCampanhas promove Controle Controle mesmo se o sync marcou MIGRACAO', () => {
    const p = normalizeEvaCampanhas({
      updated_at: 'x',
      data: '2026-09-08',
      jornada: [{ login: '20001', campaign_name: 'CONTROLE-CONTROLE', campanha_op: 'MIGRACAO' }],
      serie_hora: [{ hora: '10', campaign_name: 'CONTROLE - CONTROLE', campanha_op: 'MIGRACAO', total: 4, cpc: 1, sucesso: 0, pct_cpc: 25 }],
    } as unknown as Parameters<typeof normalizeEvaCampanhas>[0]);
    expect(p.jornada?.[0]?.campanha_op).toBe('CONTROLE_CONTROLE');
    expect(p.serie_hora?.[0]?.campanha_op).toBe('CONTROLE_CONTROLE');
  });

  it('normalizeEvaCampanhas promove Algar mesmo se o sync marcou PORTABILIDADE', () => {
    const p = normalizeEvaCampanhas({
      updated_at: 'x',
      data: '2026-09-08',
      jornada: [{ login: '30001', campaign_name: '02 - ALGAR PORTABILIDADE PREDITIVO', campanha_op: 'PORTABILIDADE' }],
    } as unknown as Parameters<typeof normalizeEvaCampanhas>[0]);
    expect(p.jornada?.[0]?.campanha_op).toBe('ALGAR');
  });

  it('CAMPANHA_FILTRO_OPTIONS inclui Ação BKO', () => {
    expect(CAMPANHA_FILTRO_OPTIONS.map((o) => o.id)).toContain('CONTROLE_CONTROLE');
    expect(CAMPANHA_FILTRO_OPTIONS.map((o) => o.id)).toContain('ALGAR');
    expect(labelCampanhaOp('CONTROLE_CONTROLE')).toBe('Controle Controle');
    expect(labelCampanhaOp('ALGAR')).toBe('Algar');
  });

  it('resolveDiscagens calcula CPC sempre sobre tabuladas, nunca sobre contato', () => {
    const disc = resolveDiscagens({
      discagens: {
        kpis: {
          dialed: 0,
          contact: 20,
          tabuladas: 0,
          cpc: 10,
          sucesso: 0,
          contact_rate: 0,
          cpc_rate: 99,
          efficacy: 0,
        },
        serie_hora: [
          {
            hora: '10',
            dialed: 100,
            contact: 20,
            tabuladas: 0,
            cpc: 10,
            sucesso: 0,
            contact_rate: 20,
            cpc_rate: 99,
            efficacy: 0,
          },
        ],
      },
    } as unknown as Parameters<typeof resolveDiscagens>[0]);
    expect(disc.kpis.cpc_rate).toBe(0);
  });

  it('resolveDiscagens alinha CPC Pulse ao CPC EVA quando o dialer está subcontado', () => {
    const disc = resolveDiscagens({
      discagens: {
        kpis: {
          dialed: 10_000,
          contact: 2_000,
          tabuladas: 10_000,
          cpc: 109,
          sucesso: 50,
          contact_rate: 20,
          cpc_rate: 1.1,
          efficacy: 0.5,
        },
        serie_hora: [{ hora: '10', dialed: 10_000, contact: 2_000, tabuladas: 10_000, cpc: 109, sucesso: 50 }],
        por_supervisor: [
          {
            supervisor_name: 'Caroline',
            operadores: 10,
            tabuladas: 10_000,
            cpc: 1370,
            sucesso: 50,
            cpc_rate: 13.7,
            conv_tab: 0.5,
          },
        ],
      },
    } as unknown as Parameters<typeof resolveDiscagens>[0]);
    expect(disc.kpis.cpc).toBe(1370);
    expect(disc.kpis.cpc_rate).toBe(13.7);
    expect(disc.kpis.dialed).toBe(10_000);
  });
});
