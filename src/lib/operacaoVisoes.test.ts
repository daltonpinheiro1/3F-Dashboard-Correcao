import { describe, expect, it } from 'vitest';
import type { EvaJornada, EvaPayload } from './evaDash';
import {
  atrasosPorSupHora,
  buildHeatmapOperacao,
  cpcOperacional,
  dropHoraCanonica,
  eixoTrilha7d,
  metaCasaOperacao,
  ocupacaoEstiloHora,
  payloadHeatmapDia,
  trilhaOfensor,
  whatIfPiso,
} from './operacaoVisoes';

const jor = (over: Partial<EvaJornada> = {}): EvaJornada => ({
  id_user: 1,
  user_name: 'Op',
  login: 'op1',
  supervisor_name: 'Sarah',
  campaign_name: 'TIM PORTABILIDADE',
  campanha_op: 'PORTABILIDADE',
  date_login: '2026-09-04T09:12:00',
  date_logout: null,
  logins: 1,
  logged_time: 3600,
  paused_time: 0,
  ...over,
});

const payloadDia = (data: string, extra: Partial<EvaPayload> = {}): EvaPayload =>
  ({
    data,
    updated_at: `${data}T12:00:00-03:00`,
    kpis_operacao: {},
    kpis_chamadas: {},
    jornada: [],
    pausas_por_tipo: [],
    chamadas_recente: [],
    top_tabulacao: [],
    por_campanha: [],
    serie_hora: [],
    ranking_operadores: [],
    ...extra,
  }) as EvaPayload;

describe('cpc / ocupação / what-if (contrato Hora)', () => {
  it('CPC operacional é cpc/tabuladas', () => {
    expect(cpcOperacional(13, 20)).toBe(65);
    expect(cpcOperacional(0, 0)).toBe(0);
  });

  it('ocupação = chamadas / (logado/TMA)', () => {
    const { capacidade, ocupacaoPct } = ocupacaoEstiloHora(3600, 120, 20);
    expect(capacidade).toBe(30);
    expect(ocupacaoPct).toBe(66.7);
  });

  it('what-if: KA × 1h × ocupação observada', () => {
    const w = whatIfPiso({ ka: 2, tmaSeg: 120, logadoSeg: 3600, chamadas: 20 });
    expect(w.ocupacaoPct).toBe(66.7);
    expect(w.tabs1h).toBe(40);
  });

  it('what-if sem TMA não inventa tabs', () => {
    expect(whatIfPiso({ ka: 5, tmaSeg: 0, logadoSeg: 3600, chamadas: 10 }).tabs1h).toBe(0);
  });
});

describe('heatmap: um dia, produto, DROP hora canônico', () => {
  const live = payloadDia('2026-09-04', {
    hora_supervisor: [
      { hora: '10', supervisor: 'Sarah', campanha_op: 'PORTABILIDADE', total: 20, cpc: 10, pct_cpc: 50 },
      { hora: '10', supervisor: 'Sarah', campanha_op: 'MIGRACAO', total: 10, cpc: 8, pct_cpc: 80 },
    ],
    discagens: {
      kpis: { dialed: 50, contact: 20, tabuladas: 10, cpc: 4, sucesso: 1 },
      tab_hora: [
        {
          nome: 'AGENTE DESLIGOU',
          campanha_op: 'PORTABILIDADE',
          total: 10,
          drop_total: 4,
          horas: { '10': 10 },
          horas_drop: { '10': 4 },
        },
      ],
    },
  } as unknown as EvaPayload);

  it('não soma dias do histórico — usa o último', () => {
    const a = payloadDia('2026-09-01');
    const b = payloadDia('2026-09-04');
    expect(payloadHeatmapDia('hist', live, [a, b])?.data).toBe('2026-09-04');
    expect(payloadHeatmapDia('live', live, [a])?.data).toBe('2026-09-04');
  });

  it('filtra produto e recalcula CPC% (não confia no pct gravado)', () => {
    const hm = buildHeatmapOperacao({
      payload: live,
      campanha: 'PORTABILIDADE',
      jornadaAtraso: [],
      metasSup: {},
      metaCasa: 65,
    });
    const c = hm.celulas.find((x) => x.supervisor === 'Sarah' && x.hora === '10');
    expect(c?.tabs).toBe(20);
    expect(c?.pct).toBe(50);
    expect(c?.abaixoMeta).toBe(true);
  });

  it('DROP da hora vem de horas_drop, não do nome da tab', () => {
    const d = dropHoraCanonica([live], 'PORTABILIDADE');
    expect(d['10'].drop).toBe(4);
    expect(d['10'].tabs).toBe(10);
    expect(d['10'].rate).toBe(40);
    expect(dropHoraCanonica([live], 'MIGRACAO')['10'].drop).toBe(0);
  });

  it('crise = atraso na hora + DROP hora ≥ 25%', () => {
    const hm = buildHeatmapOperacao({
      payload: live,
      campanha: 'PORTABILIDADE',
      jornadaAtraso: [
        jor({
          atraso_entrada_seg: 720,
          primeiro_login: '2026-09-04T10:12:00',
          date_login: '2026-09-04T10:12:00',
        }),
      ],
      metasSup: {},
      metaCasa: 65,
    });
    const c = hm.celulas.find((x) => x.supervisor === 'Sarah' && x.hora === '10');
    expect(c?.atrasos).toBe(1);
    expect(c?.crise).toBe(true);
  });
});

describe('atraso BRT', () => {
  it('marca a hora de entrada em BRT', () => {
    const m = atrasosPorSupHora(
      [jor({ atraso_entrada_seg: 180, primeiro_login: '2026-09-04T09:05:00' })],
      'PORTABILIDADE',
    );
    expect(m.get('Sarah|09')).toBe(1);
  });
});

describe('trilha 7 dias por login e produto', () => {
  it('eixo D-6…D0 e não mistura campanha', () => {
    expect(eixoTrilha7d('2026-09-04')).toEqual([
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
    const payloads = [
      payloadDia('2026-09-03', {
        jornada: [
          jor({
            date_report: '2026-09-03',
            tabuladas: 10,
            cpc: 8,
            pausa_seg: 360,
            campanha_op: 'PORTABILIDADE',
            keep_alive_abertos: 0,
          }),
          jor({
            date_report: '2026-09-03',
            tabuladas: 10,
            cpc: 1,
            campanha_op: 'MIGRACAO',
            keep_alive_abertos: 2,
          }),
        ],
      }),
    ];
    const t = trilhaOfensor(payloads, 'op1', 'PORTABILIDADE', ['2026-09-03']);
    expect(t[0].cpc).toBe(80);
    expect(t[0].ka).toBe(0);
    expect(trilhaOfensor(payloads, 'op1', 'MIGRACAO', ['2026-09-03'])[0].cpc).toBe(10);
  });
});

describe('meta casa BKO vs demais produtos', () => {
  it('Port/Mig usam meta do store; BKO usa limiar dinâmico', () => {
    const p = payloadDia('2026-09-04', {
      serie_hora: [
        { hora: '10', campanha_op: 'ACAO_BKO', total: 20, cpc: 8, sucesso: 1, pct_cpc: 40 },
      ],
    });
    expect(metaCasaOperacao({ campanha: 'PORTABILIDADE', metaDiaStore: 65, payloads: [p], dataRef: '2026-09-04' })).toBe(65);
    const bko = metaCasaOperacao({ campanha: 'ACAO_BKO', metaDiaStore: 65, payloads: [p], dataRef: '2026-09-04' });
    expect(bko).toBe(34); // 40% * 0.85
  });
});
