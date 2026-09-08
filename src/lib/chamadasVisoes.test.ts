import { describe, expect, it } from 'vitest';
import {
  calcularPerdas,
  consolidarSupervisores,
  dropFromDiscagens,
  dropPorLogin,
  dropRate,
  resolveOpDrop,
  type EvaJornada,
  type EvaOfensorTab,
  type EvaPayload,
} from './evaDash';
import { tempoDeslogueEfetivo } from './ofensorOp';
import {
  anexarDropOp,
  anexarDropSup,
  auditTabsVsJornada,
  cpcOperacional,
  consolidarDrill,
  dropTotalCanonico,
  kpisVolumeChamadas,
  mergeOfensores,
  ofensorTabPrincipal,
  payloadsPulseHora,
  pulseHoraCpcDrop,
  tempoPerdidoCanonico,
  tmaPonderadoJornada,
} from './chamadasVisoes';
import { cpcOperacional as cpcOperacao } from './operacaoVisoes';

const jor = (over: Partial<EvaJornada> = {}): EvaJornada => ({
  id_user: 1,
  user_name: 'Maria Silva',
  login: 'maria',
  supervisor_name: 'Sarah Daniela de Jesus',
  campaign_name: 'TIM PORTABILIDADE',
  campanha_op: 'PORTABILIDADE',
  date_login: '2026-09-04T09:12:00',
  date_logout: null,
  logins: 1,
  logged_time: 3600,
  paused_time: 0,
  ...over,
});

const payloadDia = (data: string, extra: Record<string, unknown> = {}): EvaPayload =>
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
  }) as unknown as EvaPayload;

describe('contrato canônico (não muda o número da casa)', () => {
  it('CPC operacional é cpc/tabuladas', () => {
    expect(cpcOperacional(13, 20)).toBe(65);
    expect(kpisVolumeChamadas({
      ranking: [{ total: 20, cpc: 13, sucesso: 2, recusa: 1 }],
      tabsHumanas: [{ total: 99, cpc: 1 }],
    }).pctCpc).toBe(65);
  });

  it('tabuladas preferem ranking quando ranking.total > 0', () => {
    const k = kpisVolumeChamadas({
      ranking: [{ total: 40, cpc: 20, sucesso: 4, recusa: 2 }],
      tabsHumanas: [{ total: 10, cpc: 3 }],
    });
    expect(k.tabuladas).toBe(40);
    expect(k.cpcN).toBe(20);
    expect(k.tabuladasTabs).toBe(10);
  });

  it('sem ranking, cai nas tabs humanas (resultado já apresentado)', () => {
    const k = kpisVolumeChamadas({
      ranking: [],
      tabsHumanas: [{ total: 10, cpc: 3 }],
    });
    expect(k.tabuladas).toBe(10);
    expect(k.cpcN).toBe(3);
    expect(k.pctCpc).toBe(30);
  });

  it('TMA ponderado = Σ(tma×chamadas)/Σ(chamadas)', () => {
    const { tma, attN } = tmaPonderadoJornada([
      { tma_seg: 100, chamadas: 2 },
      { tma_seg: 200, chamadas: 1 },
    ]);
    expect(attN).toBe(3);
    expect(tma).toBeCloseTo(400 / 3, 5);
  });
});

describe('DROP canônico (Agente Desligou)', () => {
  const payload = payloadDia('2026-09-04', {
    discagens: {
      kpis: { dialed: 50, contact: 20, tabuladas: 20, cpc: 8, sucesso: 2 },
      por_operador: [
        {
          user_name: 'Maria Silva',
          login: 'maria',
          supervisor_name: 'Sarah Daniela de Jesus',
          campanha_op: 'PORTABILIDADE',
          tabuladas: 20,
          desligue_agente: 4,
        },
      ],
      por_supervisor: [
        {
          supervisor_name: 'Sarah Daniela de Jesus',
          campanha_op: 'PORTABILIDADE',
          tabuladas: 20,
          desligue_agente: 4,
        },
      ],
      tab_hora: [],
    },
  });

  it('dropTotalCanonico bate com resolveOpDrop / discagens', () => {
    const disc = dropFromDiscagens([payload], 'TODAS');
    const ofens = dropPorLogin([]);
    const d = dropTotalCanonico([jor({ login: 'maria', user_name: 'Maria Silva', tabuladas: 20 })], disc, ofens);
    expect(d.drop).toBe(4);
    expect(d.tabs).toBe(20);
    expect(d.rate).toBe(20);
  });

  it('supervisor e operador usam o mesmo bit (não nome da tabulação)', () => {
    const disc = dropFromDiscagens([payload], 'PORTABILIDADE');
    const ofens = dropPorLogin([
      { login: 'maria', nome: 'CLIENTE DESLIGOU', total: 20, drop_agente: 99 },
    ]);
    const [sup] = anexarDropSup([{ supervisor: 'Sarah Daniela de Jesus' }], disc);
    const [op] = anexarDropOp([{ login: 'maria', operador: 'Maria Silva' }], disc, ofens);
    expect(sup._drop).toBe(4);
    expect(sup._drop_rate).toBe(20);
    expect(op._drop).toBe(4);
    expect(op._drop_rate).toBe(20);
  });
});

describe('mergeOfensores soma drop_agente no hist', () => {
  it('dois dias somam drop_agente sem alterar CPC%', () => {
    const of1: EvaOfensorTab = {
      nome: 'AGENTE DESLIGOU',
      login: 'maria',
      operador: 'Maria',
      supervisor: 'Sarah',
      campanha_op: 'PORTABILIDADE',
      total: 10,
      cpc: 2,
      drop_agente: 3,
      tma_seg: 100,
    };
    const of2: EvaOfensorTab = {
      ...of1,
      total: 6,
      cpc: 1,
      drop_agente: 2,
      tma_seg: 200,
    };
    const merged = mergeOfensores([
      payloadDia('2026-09-03', { ofensores_tab: [of1] }),
      payloadDia('2026-09-04', { ofensores_tab: [of2] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].total).toBe(16);
    expect(merged[0].cpc).toBe(3);
    expect(merged[0].drop_agente).toBe(5);
    expect(merged[0].pct_cpc).toBe(18.8);
  });

  it('sem drop_agente no snapshot, o campo fica ausente (fallback isTabDrop)', () => {
    const of: EvaOfensorTab = {
      nome: 'AGENTE DESLIGOU',
      login: 'maria',
      operador: 'Maria',
      supervisor: 'Sarah',
      total: 4,
      cpc: 0,
    };
    const merged = mergeOfensores([
      payloadDia('2026-09-03', { ofensores_tab: [of] }),
      payloadDia('2026-09-04', { ofensores_tab: [{ ...of, total: 3 }] }),
    ]);
    expect(merged[0].total).toBe(7);
    expect(merged[0].drop_agente).toBeUndefined();
    const ofens = dropPorLogin(merged);
    expect(ofens.maria.drop).toBe(7);
  });
});

describe('visões derivadas (não mudam o hero)', () => {
  it('auditTabsVsJornada aponta delta sem reescrever tabuladas', () => {
    const a = auditTabsVsJornada(40, [jor({ tabuladas: 40 })]);
    expect(a.bate).toBe(true);
    expect(a.comparavel).toBe(true);
    const b = auditTabsVsJornada(40, [jor({ tabuladas: 38 })]);
    expect(b.bate).toBe(false);
    expect(b.delta).toBe(2);
    expect(auditTabsVsJornada(10, [jor({ tabuladas: 40 })], { buscaAtiva: true }).comparavel).toBe(false);
  });

  it('consolidarDrill pondera TMA da fatia (não zera a coluna)', () => {
    const drill = consolidarDrill([
      {
        nome: 'Pior',
        login: 'maria',
        operador: 'Maria',
        supervisor: 'Sarah',
        total: 10,
        cpc: 2,
        tma_seg: 100,
      },
      {
        nome: 'Pior',
        login: 'joao',
        operador: 'Joao',
        supervisor: 'Sarah',
        total: 5,
        cpc: 1,
        tma_seg: 200,
      },
    ]);
    expect(drill).toHaveLength(1);
    expect(drill[0].tabuladas).toBe(15);
    expect(drill[0].tma_seg).toBe(Math.round((100 * 10 + 200 * 5) / 15 * 10) / 10);
  });

  it('ofensorTabPrincipal escolhe o pior CPC com amostra', () => {
    const o = ofensorTabPrincipal(
      [
        { nome: 'OK', total: 20, cpc: 16, tma_seg: 80 },
        { nome: 'Pior', total: 10, cpc: 2, tma_seg: 120 },
        { nome: 'Ruim sem amostra', total: 2, cpc: 0, tma_seg: 200 },
      ],
      50,
    );
    expect(o?.nome).toBe('Pior');
    expect(o?.pct).toBe(20);
    expect(o?.abaixoMeta).toBe(true);
  });

  it('pulseHoraCpcDrop usa DROP hora canônico', () => {
    const p = payloadDia('2026-09-04', {
      serie_hora: [{ hora: '14', total: 10, cpc: 4, campanha_op: 'PORTABILIDADE' }],
      discagens: {
        kpis: { dialed: 20, contact: 10, tabuladas: 10, cpc: 4, sucesso: 1 },
        tab_hora: [
          {
            nome: 'AGENTE DESLIGOU',
            campanha_op: 'PORTABILIDADE',
            total: 10,
            drop_total: 3,
            horas: { '14': 10 },
            horas_drop: { '14': 3 },
          },
        ],
      },
    });
    const horas = pulseHoraCpcDrop([p], 'PORTABILIDADE');
    const h14 = horas.find((h) => h.hora === '14');
    expect(h14?.pct).toBe(40);
    expect(h14?.drop).toBe(3);
    expect(h14?.dropRate).toBe(30);
    expect(h14?.crise).toBe(true);
    expect(horas.reduce((s, h) => s + h.tabs, 0)).toBe(10);
  });

  it('payloadsPulseHora no hist usa só o último dia (não soma o recorte)', () => {
    const d1 = payloadDia('2026-09-03', {
      serie_hora: [{ hora: '14', total: 99, cpc: 1, campanha_op: 'PORTABILIDADE' }],
    });
    const d2 = payloadDia('2026-09-04', {
      serie_hora: [{ hora: '14', total: 10, cpc: 4, campanha_op: 'PORTABILIDADE' }],
    });
    const src = payloadsPulseHora('hist', null, [d1, d2]);
    expect(src).toHaveLength(1);
    expect(src[0].data).toBe('2026-09-04');
    expect(pulseHoraCpcDrop(src, 'PORTABILIDADE').find((h) => h.hora === '14')?.tabs).toBe(10);
  });
});

describe('contrato ponta a ponta entre abas', () => {
  it('CPC% Chamadas = Operação = Discagens (cpc/tabuladas, 1 casa)', () => {
    expect(cpcOperacional(13, 20)).toBe(cpcOperacao(13, 20));
    expect(cpcOperacional(13, 20)).toBe(65);
    expect(Math.round((1000 * 13) / 20) / 10).toBe(65);
  });

  it('TMA Chamadas = Operação = Hora (Σ tma×ch / Σ ch)', () => {
    const jornada = [
      { tma_seg: 120, chamadas: 3 },
      { tma_seg: 180, chamadas: 1 },
    ];
    const tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
    const attN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
    const tmaOp = attN ? tmaPond / attN : 0;
    expect(tmaPonderadoJornada(jornada).tma).toBe(tmaOp);
    expect(tmaOp).toBe(135);
  });

  it('DROP casa Chamadas = algoritmo da Operação (bit Agente Desligou)', () => {
    const payload = payloadDia('2026-09-04', {
      discagens: {
        kpis: { dialed: 50, contact: 20, tabuladas: 20, cpc: 8, sucesso: 2 },
        por_operador: [
          {
            user_name: 'Maria Silva',
            login: 'maria',
            supervisor_name: 'Sarah Daniela de Jesus',
            campanha_op: 'PORTABILIDADE',
            tabuladas: 20,
            desligue_agente: 4,
          },
        ],
      },
    });
    const jornada = [jor({ login: 'maria', user_name: 'Maria Silva' })];
    const disc = dropFromDiscagens([payload], 'TODAS');
    const ofens = dropPorLogin([]);
    const casa = dropTotalCanonico(jornada, disc, ofens);
    const seen = new Set<string>();
    let drop = 0;
    let tabs = 0;
    for (const j of jornada) {
      const key = (j.login || j.user_name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const d = resolveOpDrop(j.login || undefined, j.user_name || undefined, disc, ofens);
      drop += d.drop;
      tabs += d.tabs;
    }
    expect(casa).toEqual({ drop, tabs, rate: dropRate(drop, tabs) });
    expect(casa.rate).toBe(20);
  });

  it('perdas: fantasma sem ocorrência = 0 (Operação); ocorrência usa o tempo', () => {
    const fantasma = jor({ tempo_perdido_seg: 400, relogins: 0, keep_alive_abertos: 0, deslogs: [] });
    const real = jor({
      tempo_perdido_seg: 400,
      relogins: 1,
      deslogs: [{ logout: 'x', relogin: 'y', seg: 120 }],
    });
    expect(tempoDeslogueEfetivo(fantasma)).toBe(0);
    expect(tempoPerdidoCanonico([fantasma, real])).toBe(400);
    const p = calcularPerdas({
      tempoDeslogueSeg: 400,
      pausaSeg: 0,
      logadoSeg: 3600,
      tmaSeg: 100,
      tabuladas: 20,
      sucesso: 4,
      vb: 2,
    });
    expect(p.conversao_pct).toBe(20);
    expect(p.chamadas_perdidas).toBe(4);
  });

  it('supervisor: consolidarSupervisores ignora deslogue fantasma', () => {
    const rows = consolidarSupervisores([
      jor({ tempo_perdido_seg: 400, relogins: 0, keep_alive_abertos: 0, deslogs: [], tabuladas: 10, cpc: 5, sucesso: 1 }),
      jor({
        login: 'joao',
        user_name: 'Joao',
        tempo_perdido_seg: 200,
        relogins: 1,
        deslogs: [{ logout: 'x', relogin: 'y', seg: 200 }],
        tabuladas: 10,
        cpc: 5,
        sucesso: 1,
      }),
    ]);
    expect(rows[0].tempo_perdido_seg).toBe(200);
  });
});
