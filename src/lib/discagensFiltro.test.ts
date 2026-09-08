import { describe, expect, it } from 'vitest';
import {
  filtrarAlertasQueda,
  filtrarInsightsDiscagens,
  filtrarOutliersConversao,
  matchDiscRow,
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
});
