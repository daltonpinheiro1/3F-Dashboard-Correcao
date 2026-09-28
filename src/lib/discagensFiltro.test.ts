import { describe, expect, it } from 'vitest';
import {
  amdMixShare,
  avisoGranularidade,
  filtrarAlertasQueda,
  filtrarAlertasQuedaHora,
  filtrarInsightsDiscagens,
  filtrarOutliersConversao,
  horaDoAlerta,
  matchDiscRow,
  ociosidadePulseNaHora,
  overlayCpcTabulacaoHumana,
  sumCpcHumano,
  tempoDiscandoRecorte,
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

describe('recorte por hora', () => {
  const alertas = [
    { mailing: 'A', msg: 'a', nivel: 'alto', slot: '2026-09-28 10:20' },
    { mailing: 'B', msg: 'b', nivel: 'alto', slot_hora: '9:40' },
    { mailing: 'C', msg: 'c', nivel: 'medio', slot_hora: '14:00', slot: '2026-09-28 10:00' },
    { mailing: 'D', msg: 'd', nivel: 'medio' },
  ];

  it('hora do alerta prefere slot_hora e cai no slot', () => {
    expect(horaDoAlerta(alertas[0])).toBe('10');
    expect(horaDoAlerta(alertas[1])).toBe('09');
    expect(horaDoAlerta(alertas[2])).toBe('14');
    expect(horaDoAlerta(alertas[3])).toBe('');
  });

  it('queda PIR segue a hora; sem slot some no recorte', () => {
    expect(filtrarAlertasQuedaHora(alertas, 'todas')).toHaveLength(4);
    expect(filtrarAlertasQuedaHora(alertas, '10').map((a) => a.mailing)).toEqual(['A']);
    expect(filtrarAlertasQuedaHora(alertas, '09').map((a) => a.mailing)).toEqual(['B']);
    expect(filtrarAlertasQuedaHora(alertas, '21')).toEqual([]);
    expect(filtrarAlertasQuedaHora(undefined, '10')).toEqual([]);
  });

  it('aviso só quando o filtro ativo não existe na origem', () => {
    const base = { detalhaHora: false, detalhaCampanha: true } as const;
    expect(avisoGranularidade({ ...base, hora: 'todas', campanha: 'PORTABILIDADE' })).toBeNull();
    expect(avisoGranularidade({ ...base, hora: '10', campanha: 'TODAS' })).toMatch(/não detalha por hora/);
    expect(
      avisoGranularidade({ hora: 'todas', campanha: 'MIGRACAO', detalhaHora: false, detalhaCampanha: false }),
    ).toMatch(/não detalha por campanha/);
    expect(
      avisoGranularidade({ hora: '10', campanha: 'MIGRACAO', detalhaHora: false, detalhaCampanha: false }),
    ).toMatch(/hora nem por campanha/);
    expect(
      avisoGranularidade({ hora: '10', campanha: 'MIGRACAO', detalhaHora: true, detalhaCampanha: true }),
    ).toBeNull();
  });

  it('tempo discando: hora filtrada não finge valor; campanha soma a jornada', () => {
    const jornada = [
      { campanha_op: 'PORTABILIDADE', dialing_time: 100 },
      { campanha_op: 'MIGRACAO', dialing_time: 50 },
      { campanha_op: 'PORTABILIDADE', dialing_time: 20 },
    ];
    expect(tempoDiscandoRecorte({ hora: '10', campanha: 'TODAS', kpisDialingSeg: 999, jornada })).toBeNull();
    expect(tempoDiscandoRecorte({ hora: 'todas', campanha: 'TODAS', kpisDialingSeg: 999, jornada })).toBe(999);
    expect(tempoDiscandoRecorte({ hora: 'todas', campanha: 'PORTABILIDADE', kpisDialingSeg: 999, jornada })).toBe(120);
    expect(
      tempoDiscandoRecorte({ hora: 'todas', campanha: 'PORTABILIDADE', kpisDialingSeg: 999, jornada: [{ campanha_op: 'PORTABILIDADE' }] }),
    ).toBeNull();
  });

  it('ociosidade do Pulse usa a espera da hora só sem campanha filtrada', () => {
    const dia = { media: 30, medida: true, vales: 12 };
    const porHora = new Map([['10', 42]]);
    expect(ociosidadePulseNaHora({ hora: 'todas', campanha: 'MIGRACAO', dia, porHora })).toEqual(dia);
    const h10 = ociosidadePulseNaHora({ hora: '10', campanha: 'TODAS', dia, porHora });
    expect(h10.media).toBe(42);
    expect(h10.medida).toBe(true);
    expect(h10.vales).toBeNull();
    expect(ociosidadePulseNaHora({ hora: '10', campanha: 'MIGRACAO', dia, porHora }).medida).toBe(false);
    expect(ociosidadePulseNaHora({ hora: '11', campanha: 'TODAS', dia, porHora }).medida).toBe(false);
  });
});
