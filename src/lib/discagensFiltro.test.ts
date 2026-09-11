import { describe, expect, it } from 'vitest';
import {
  amdMixShare,
  filtrarAlertasQueda,
  filtrarInsightsDiscagens,
  filtrarOutliersConversao,
  matchDiscRow,
  overlayCpcTabulacaoHumana,
  sumCpcHumano,
} from './discagensFiltro';

describe('filtro Discagens por campanha', () => {
  it('outliers de Portabilidade não aparecem em Controle Controle', () => {
    const rows = [
      {
        id_user: 1,
        user_name: 'LIVIA',
        supervisor_name: 'X',
        queue_name: '03 - TIM PORTABILIDADE RECEPTIVO',
        campanha_op: 'PORTABILIDADE',
        tabuladas: 12,
        cpc: 7,
        sucesso: 0,
        cpc_rate: 58.3,
        conv_tab: 0,
        nivel: 'medio',
        fila_cpc_mediana: 55.6,
        fila_conv_mediana: 7.7,
        flags: [],
        msg: '',
      },
      {
        id_user: 2,
        user_name: 'CC OP',
        supervisor_name: 'Y',
        queue_name: 'CONTROLE - CONTROLE',
        campanha_op: 'CONTROLE_CONTROLE',
        tabuladas: 10,
        cpc: 4,
        sucesso: 1,
        cpc_rate: 40,
        conv_tab: 10,
        nivel: 'medio',
        fila_cpc_mediana: 40,
        fila_conv_mediana: 8,
        flags: [],
        msg: '',
      },
    ];
    const cc = filtrarOutliersConversao(rows, 'CONTROLE_CONTROLE');
    expect(cc).toHaveLength(1);
    expect(cc[0].user_name).toBe('CC OP');
    expect(filtrarOutliersConversao(rows, 'PORTABILIDADE')).toHaveLength(1);
    expect(filtrarOutliersConversao(rows, 'TODAS')).toHaveLength(2);
  });

  it('queda PIR de BKO/Migração some no recorte Controle Controle', () => {
    const alertas = [
      { mailing: 'SMS', campanha_op: 'ACAO_BKO', queue_name: 'AÇÃO BKO', msg: 'queda BKO', nivel: 'alto' },
      { mailing: 'SILVER', campanha_op: 'MIGRACAO', queue_name: 'PRE CONTROLE PREDITIVO', msg: 'queda mig', nivel: 'alto' },
      { mailing: 'CC', campanha_op: 'CONTROLE_CONTROLE', queue_name: 'CONTROLE - CONTROLE', msg: 'queda cc', nivel: 'medio' },
    ];
    const cc = filtrarAlertasQueda(alertas, 'CONTROLE_CONTROLE');
    expect(cc.map((a) => a.mailing)).toEqual(['CC']);
  });

  it('insight de métrica peer some no recorte; outlier segue a fila', () => {
    const insights = [
      { tipo: 'metrica', titulo: 'CPC peer', detalhe: 'x', severidade: 'info' },
      {
        tipo: 'outlier',
        titulo: 'fora do padrão',
        detalhe: 'LIVIA',
        severidade: 'alto',
        queue_name: '03 - TIM PORTABILIDADE RECEPTIVO',
        campanha_op: 'PORTABILIDADE',
      },
    ];
    expect(filtrarInsightsDiscagens(insights, 'TODAS')).toHaveLength(2);
    expect(filtrarInsightsDiscagens(insights, 'CONTROLE_CONTROLE')).toHaveLength(0);
    expect(filtrarInsightsDiscagens(insights, 'PORTABILIDADE')).toHaveLength(1);
  });

  it('ALGAR PORTABILIDADE não casa com Port TIM', () => {
    expect(
      matchDiscRow(
        { campanha_op: 'ALGAR', queue_name: '02 - ALGAR PORTABILIDADE PREDITIVO' },
        'PORTABILIDADE',
      ),
    ).toBe(false);
    expect(
      matchDiscRow(
        { campanha_op: 'ALGAR', queue_name: '02 - ALGAR PORTABILIDADE PREDITIVO' },
        'ALGAR',
      ),
    ).toBe(true);
  });

  it('insight de outlier com só queue_name (sem campanha_op) segue a fila', () => {
    const insights = [
      {
        tipo: 'outlier',
        titulo: 'fora',
        detalhe: 'YASMIN',
        severidade: 'alto',
        queue_name: '03 - TIM PORTABILIDADE RECEPTIVO',
      },
    ];
    expect(filtrarInsightsDiscagens(insights, 'CONTROLE_CONTROLE')).toHaveLength(0);
    expect(filtrarInsightsDiscagens(insights, 'PORTABILIDADE')).toHaveLength(1);
  });
});

describe('overlay CPC tabulação humana', () => {
  it('substitui CPC nativo do dialer pelo CPC EVA quando o contrato é outro', () => {
    const d = {
      kpis: {
        dialed: 60_000,
        contact: 8_000,
        tabuladas: 60_640,
        cpc: 109,
        sucesso: 200,
        contact_rate: 13.3,
        cpc_rate: 1.8,
        efficacy: 0.3,
      },
      por_supervisor: [
        { supervisor_name: 'Caroline', operadores: 20, tabuladas: 40_000, cpc: 6960, sucesso: 100, cpc_rate: 17.4, conv_tab: 0.3 },
        { supervisor_name: 'Gislane', operadores: 15, tabuladas: 20_640, cpc: 1630, sucesso: 80, cpc_rate: 7.9, conv_tab: 0.4 },
      ],
    };
    const k = overlayCpcTabulacaoHumana(d.kpis, d, 'TODAS');
    expect(k.cpc).toBe(8590);
    expect(k.cpc_rate).toBe(14.2);
    expect(k.tabuladas).toBe(60_640);
    expect(k.dialed).toBe(60_000);
  });

  it('não mexe quando CPC nativo já está no mesmo contrato da tabulação', () => {
    const d = {
      kpis: { cpc: 100, cpc_rate: 10, tabuladas: 1000 },
      por_supervisor: [
        { supervisor_name: 'A', operadores: 1, tabuladas: 1000, cpc: 100, sucesso: 10, cpc_rate: 10, conv_tab: 1 },
      ],
    };
    const k = overlayCpcTabulacaoHumana(d.kpis, d, 'TODAS');
    expect(k.cpc).toBe(100);
    expect(k.cpc_rate).toBe(10);
  });

  it('soma CPC humano só da campanha filtrada', () => {
    const human = sumCpcHumano(
      {
        por_operador: [
          { campanha_op: 'PORTABILIDADE', queue_name: '03 - TIM PORTABILIDADE RECEPTIVO', cpc: 50, tabuladas: 200 },
          { campanha_op: 'MIGRACAO', queue_name: 'PRE CONTROLE', cpc: 80, tabuladas: 400 },
        ],
      },
      'PORTABILIDADE',
    );
    expect(human.cpc).toBe(50);
    expect(human.tabuladas).toBe(200);
  });
});

describe('amdMixShare', () => {
  it('é share entre linhas AMD, não vs discadas do KPI', () => {
    const mix = 4_146_705;
    const caixa = 1_740_988;
    const kpiDialed = 9814;
    expect(amdMixShare(caixa, mix)).toBe(42);
    expect(amdMixShare(caixa, kpiDialed)).toBeGreaterThan(100);
  });

  it('sem mix não inventa 0% mentiroso de outra conta', () => {
    expect(amdMixShare(10, 0)).toBe(0);
  });
});
