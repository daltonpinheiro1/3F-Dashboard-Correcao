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
      { tipo: 'retentativa', nivel: 'oportunidade', titulo: 'c', texto: '' },
    ];
    expect(alertasFolego(base, 'TODAS').map((r) => r.titulo)).toEqual(['a', 'b']);
    expect(alertasFolego(base, 'MIGRACAO').map((r) => r.titulo)).toEqual(['a']);
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
