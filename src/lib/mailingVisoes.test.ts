import { describe, expect, it } from 'vitest';
import { parseMailingSaude, type MailingItem, type MailingSaude } from '../../shared/contracts/mailing';
import { ganhoRetentativa, horaAtual, montarVisao, somarCurvas, tendencia, wilson } from './mailingVisoes';

function item(id: number, campanha_op: string, t: number, c: number, s: number, disp: number): MailingItem {
  return {
    id,
    nome: `m${id}`,
    nome_curto: `M ${id}`,
    campanha_op,
    campanha_nome: campanha_op,
    status_eva: 1,
    inicio: null,
    fim: null,
    hoje: {
      tentativas: t,
      phones: t / 2,
      alo_robo: c * 10,
      contatos: c,
      sucesso: s,
      giro: 2,
      taxa_alo: 0,
      taxa_contato: c / t,
      taxa_transferencia: 0.1,
      taxa_sucesso_contato: 0,
    },
    estoque: {
      clientes: 0, virgens: 0, trabalhados: 0, disponiveis: disp, agendados: 0, finalizados: 0,
      bloqueados_tentativa: 0, spin: 0, discados_vida: 0, localizados_vida: 0, sucesso_vida: 0, loc_5min: 0, loc_30min: 0,
    },
    propensao: { p_contato: 0, p_contato_ic: [0, 0], p_sucesso_contato: 0, sucesso_100mil: 0, sucesso_100mil_ic: [0, 0], score: null },
    previsao_hora: { ritmo: 0, contatos: 4, contatos_ic: [0, 0], sucesso: 1, sucesso_ic: [0, 0] },
    folego_dias: null,
    tendencia: { inclinacao: 0, rel_hora: 0, t: 0, significativa: false, pontos: 0 },
    desgaste: { indice: id === 1 ? 20 : 60, status: 'saudavel', componentes: {} },
    curva: [
      { k: 1, em_risco: t / 2, contatos: c / 2, taxa: 0, ic_baixo: 0, ic_alto: 0, acumulada: 0 },
      { k: 2, em_risco: t / 4, contatos: c / 2, taxa: 0, ic_baixo: 0, ic_alto: 0, acumulada: 0 },
    ],
    corte: null,
    serie_hora: [
      { hora: '09', tentativas: t / 2, alo_robo: 0, contatos: c / 2, sucesso: 0, taxa: 0 },
      { hora: '10', tentativas: t / 2, alo_robo: 0, contatos: c / 2, sucesso: s, taxa: 0 },
    ],
  };
}

function payload(): MailingSaude {
  const mailings = [item(1, 'PORTABILIDADE', 10000, 20, 1, 5000), item(2, 'MIGRACAO', 4000, 40, 3, 400)];
  return {
    versao: 1,
    data: '2026-09-24',
    updated_at: '2026-09-24T14:41:25',
    definicoes: {},
    resumo: {
      mailings: 2, tentativas: 14000, phones: 7000, alo_robo: 600, contatos: 60, sucesso: 4, giro: 2,
      taxa_alo: 0, taxa_contato: 0, taxa_transferencia: 0, taxa_sucesso_contato: 0, sucesso_100mil: 0,
      insistencia_pct: 0, disponiveis: 5400, folego_dias: 0.77, desgaste_medio: 31,
      previsao_contatos_hora: 8, previsao_contatos_ic: [0, 0], previsao_sucesso_hora: 2, previsao_sucesso_ic: [0, 0],
      tendencia: { inclinacao: 0, rel_hora: 0, t: 0, significativa: false, pontos: 0 },
    },
    curva: [],
    distribuicao: [],
    corte: null,
    serie_hora: [],
    serie_dia: [],
    mailings,
    recomendacoes: [
      { tipo: 'folego', nivel: 'alerta', titulo: 'a', texto: '', campanha_op: 'MIGRACAO' },
      { tipo: 'desgaste', nivel: 'alerta', titulo: 'b', texto: '', mailing: 1 },
    ],
  };
}

describe('mailingVisoes', () => {
  it('filtro por campanha soma só os mailings dela e refaz a curva', () => {
    const v = montarVisao(payload(), 'MIGRACAO');
    expect(v.mailings.map((m) => m.id)).toEqual([2]);
    expect(v.tentativas).toBe(4000);
    expect(v.sucesso_100mil).toBe(75);
    expect(v.folego_dias).toBe(0.2);
    expect(v.curva[0].em_risco).toBe(2000);
    expect(v.curva[1].taxa).toBe(20 / 1000);
    expect(v.recomendacoes.map((r) => r.titulo)).toEqual(['a']);
  });

  it('filtro recalcula insistência e distribuição do recorte', () => {
    const p = payload();
    p.mailings[0].distribuicao = [
      { n: 1, rotulo: '1', phones: 100, pct: 50, contatos: 10, sucesso: 1 },
      { n: 5, rotulo: '5', phones: 100, pct: 50, contatos: 5, sucesso: 0 },
    ];
    p.mailings[1].distribuicao = [
      { n: 1, rotulo: '1', phones: 50, pct: 50, contatos: 5, sucesso: 1 },
      { n: 6, rotulo: '6', phones: 50, pct: 50, contatos: 2, sucesso: 0 },
    ];
    p.distribuicao = [];
    const v = montarVisao(p, 'MIGRACAO');
    expect(v.distribuicao.map((d) => d.n)).toEqual([1, 6]);
    expect(v.insistencia_pct).toBe(7.5); // 6*50 / 4000 * 100
  });

  it('visão expõe funil e estimativa por 1 milhão', () => {
    const v = montarVisao(payload(), 'MIGRACAO');
    expect(v.sucesso_1mi).toBe(750); // 3/4000 * 1e6
    expect(v.taxa_sucesso_contato).toBe(3 / 40);
    expect(v.funil.map((e) => e.id)).toEqual(['tentativas', 'alo', 'contato', 'sucesso']);
    expect(v.funil[v.funil.length - 1].convAnterior).toBe(3 / 40);
  });

  it('dist parcial no filtro não inventa insistência', () => {
    const p = payload();
    p.mailings[0].distribuicao = [
      { n: 1, rotulo: '1', phones: 100, pct: 50, contatos: 10, sucesso: 1 },
      { n: 5, rotulo: '5', phones: 100, pct: 50, contatos: 5, sucesso: 0 },
    ];
    // mailing 1 (PORTABILIDADE) sem dist — recorte PORTABILIDADE tem só o item 0? item 0 is PORTABILIDADE
    // use MIGRACAO which is only item 2 without dist
    delete p.mailings[1].distribuicao;
    const v = montarVisao(p, 'MIGRACAO');
    expect(v.dist_cobertura_completa).toBe(false);
    expect(v.distribuicao).toEqual([]);
    expect(v.insistencia_pct).toBeNull();
  });

  it('TODAS faz fallback para dist por mailing se o top-level vier vazio', () => {
    const p = payload();
    p.distribuicao = [];
    p.mailings[0].distribuicao = [{ n: 1, rotulo: '1', phones: 50, pct: 100, contatos: 5, sucesso: 1 }];
    p.mailings[1].distribuicao = [{ n: 2, rotulo: '2', phones: 50, pct: 100, contatos: 5, sucesso: 0 }];
    const v = montarVisao(p, 'TODAS');
    expect(v.distribuicao.map((d) => d.n)).toEqual([1, 2]);
    expect(v.dist_cobertura_completa).toBe(true);
  });

  it('enriquecerSerieHora: expectativa leave-past e hora aberta dinâmica', async () => {
    const { enriquecerSerieHora } = await import('./mailingVisoes');
    const serie = [
      { hora: '09', tentativas: 1000, alo_robo: 0, contatos: 20, sucesso: 1, taxa: 0.02 },
      { hora: '10', tentativas: 1000, alo_robo: 0, contatos: 10, sucesso: 0, taxa: 0.01 },
      { hora: '11', tentativas: 500, alo_robo: 0, contatos: 5, sucesso: 0, taxa: 0.01 },
    ];
    const r = enriquecerSerieHora(serie, '2026-09-24T11:20:00');
    expect(r[0].taxa_esperada).toBeNull();
    expect(r[0].aberta).toBe(false);
    expect(r[1].taxa_esperada).toBeCloseTo(0.02, 6);
    expect(r[1].aderencia).toBeCloseTo(0.5, 6);
    expect(r[1].aberta).toBe(false);
    expect(r[2].aberta).toBe(true);
    expect(r[2].taxa_esperada).toBeCloseTo(0.015, 6); // (20+10)/2000
  });

  it('contrato distingue índice/dia de saúde', () => {
    expect(parseMailingSaude({ versao: 1, dias: [{ data: '2026-09-24' }] }).ok).toBe(false);
    expect(
      parseMailingSaude({
        data: '2026-09-24',
        atualizado: '2026-09-24T12:00:00',
        tentativas: 1,
      }).ok,
    ).toBe(false);
    const p = payload() as unknown as Record<string, unknown>;
    delete p.updated_at;
    p.atualizado = '2026-09-24T12:00:00';
    expect(parseMailingSaude(p).ok).toBe(true);
  });

  it('filtro de campanha mantém recomendação ligada ao mailing do recorte', () => {
    const v = montarVisao(payload(), 'PORTABILIDADE');
    expect(v.recomendacoes.map((r) => r.titulo)).toEqual(['b']);
  });

  it('visão geral usa o resumo e as recomendações do coletor', () => {
    const v = montarVisao(payload(), 'TODAS');
    expect(v.tentativas).toBe(14000);
    expect(v.desgaste_medio).toBe(31);
    expect(v.recomendacoes).toHaveLength(2);
  });

  it('por_regiao traz share e penetração ponderada; aderência média das fechadas', () => {
    const p = payload();
    p.por_regiao = [
      {
        regiao: 'Sudeste',
        campanha_op: 'PORTABILIDADE',
        tentativas: 8000,
        contatos: 16,
        sucesso: 1,
        taxa_contato: 0.002,
        sucesso_1mi: 125,
        phones: 100,
        pct_virgin: 0.4,
        pct_saturado: 0.1,
      },
      {
        regiao: 'Nordeste',
        campanha_op: 'PORTABILIDADE',
        tentativas: 2000,
        contatos: 4,
        sucesso: 0,
        taxa_contato: 0.002,
        sucesso_1mi: 0,
        phones: 50,
        pct_virgin: 0.2,
        pct_saturado: 0.3,
      },
    ];
    p.serie_hora = [
      { hora: '09', tentativas: 1000, alo_robo: 0, contatos: 20, sucesso: 1, taxa: 0.02 },
      { hora: '10', tentativas: 1000, alo_robo: 0, contatos: 10, sucesso: 0, taxa: 0.01 },
      { hora: '14', tentativas: 500, alo_robo: 0, contatos: 5, sucesso: 0, taxa: 0.01 },
    ];
    p.updated_at = '2026-09-24T14:41:25';
    const v = montarVisao(p, 'TODAS');
    expect(v.por_regiao[0].regiao).toBe('Sudeste');
    expect(v.por_regiao[0].share_pct).toBeCloseTo(0.8, 6);
    expect(v.por_regiao[0].pct_virgin).toBeCloseTo(0.4, 6);
    expect(v.por_regiao[1].pct_virgin).toBeCloseTo(0.2, 6);
    expect(v.aderencia_media).toBeCloseTo(0.5, 6);
  });

  it('pct virgin/esgotado do estoque da lista', async () => {
    const { pctVirginEstoque, pctEsgotadoEstoque } = await import('./mailingVisoes');
    const m = item(1, 'PORTABILIDADE', 1000, 10, 1, 100);
    m.estoque.clientes = 1000;
    m.estoque.virgens = 250;
    m.desgaste.componentes = { esgotado: 0.35 };
    expect(pctVirginEstoque(m)).toBeCloseTo(0.25, 6);
    expect(pctEsgotadoEstoque(m)).toBeCloseTo(0.35, 6);
  });

  it('curva somada acumula a probabilidade de contato', () => {
    const c = somarCurvas([
      [{ k: 1, em_risco: 100, contatos: 10, taxa: 0, ic_baixo: 0, ic_alto: 0, acumulada: 0 },
       { k: 2, em_risco: 90, contatos: 9, taxa: 0, ic_baixo: 0, ic_alto: 0, acumulada: 0 }],
    ]);
    expect(c[1].acumulada).toBeCloseTo(1 - 0.9 * 0.9, 6);
    expect(c[0].ic_baixo).toBeLessThan(0.1);
    expect(c[0].ic_alto).toBeGreaterThan(0.1);
  });

  it('wilson, tendência e retentativa batem com o coletor', () => {
    const [lo, hi] = wilson(0, 100);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0.03);
    const t = tendencia([[9, 0.03, 1000], [10, 0.02, 1000], [11, 0.01, 1000]]);
    expect(t.inclinacao).toBeCloseTo(-0.01, 6);
    expect(t.rel_hora).toBeCloseTo(-0.5, 6);
    expect(horaAtual('2026-09-24T14:41:25')).toBe(14);
    expect(
      ganhoRetentativa([
        { k: 1, em_risco: 100000, contatos: 75, taxa: 0.00075, ic_baixo: 0, ic_alto: 0, acumulada: 0 },
        { k: 2, em_risco: 20000, contatos: 55, taxa: 0.00275, ic_baixo: 0, ic_alto: 0, acumulada: 0 },
      ]),
    ).toBeCloseTo(3.667, 2);
  });

  it('contrato recusa payload com telefone', () => {
    const p = payload() as unknown as Record<string, unknown>;
    expect(parseMailingSaude(p).ok).toBe(true);
    const ruim = { ...p, mailings: [{ ...(p.mailings as object[])[0], phone_number: '1' }] };
    expect(parseMailingSaude(ruim).ok).toBe(false);
  });
});

describe('mailingSaude helpers', () => {
  it('alertasFolego filtra por campanha e tipo', async () => {
    const { alertasFolego } = await import('./mailingSaude');
    const base = payload();
    base.recomendacoes = [
      { tipo: 'folego', nivel: 'alerta', titulo: 'a', texto: '', campanha_op: 'MIGRACAO' },
      { tipo: 'desgaste', nivel: 'alerta', titulo: 'b', texto: '', campanha_op: 'PORTABILIDADE' },
      { tipo: 'priorizar', nivel: 'oportunidade', titulo: 'prio', texto: '', campanha_op: 'PORTABILIDADE' },
      { tipo: 'retentativa', nivel: 'oportunidade', titulo: 'c', texto: '' },
    ];
    expect(alertasFolego(base, 'TODAS').map((r) => r.titulo)).toEqual(['a', 'b', 'prio']);
    expect(alertasFolego(base, 'MIGRACAO').map((r) => r.titulo)).toEqual(['a']);
    expect(alertasFolego(base, 'PORTABILIDADE').map((r) => r.titulo)).toEqual(['b', 'prio']);
  });

  it('parseMailingDias aceita índice enriquecido', async () => {
    const { parseMailingDias } = await import('../../shared/contracts/mailing');
    const ok = parseMailingDias({
      versao: 1,
      dias: [
        {
          data: '2026-09-24',
          atualizado: '2026-09-24T15:00:00',
          tentativas: 1,
          phones: 1,
          contatos: 0,
          sucesso: 0,
          giro: 1,
          taxa_contato: 0,
          desgaste_medio: 10,
          disponiveis: 1,
          sucesso_100mil: 0,
          mailings_folego_curto: 0,
        },
      ],
    });
    expect(ok.ok).toBe(true);
    expect(parseMailingDias({ dias: [{ data: 'x' }] }).ok).toBe(false);
  });
});
