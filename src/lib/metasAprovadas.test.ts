import { describe, expect, it } from 'vitest';
import type { EvaPayload } from './evaDash';
import { aprovadasDoPayload, calcularMetaAprovadas } from './metasAprovadas';

function payload(
  data: string,
  rows: Array<{ campanha_op: string; aprovadas: number; vb?: number }>,
): EvaPayload {
  return {
    data,
    updated_at: `${data}T22:00:00`,
    kpis_operacao: {},
    kpis_chamadas: {},
    jornada: [],
    pausas_por_tipo: [],
    chamadas_recente: [],
    top_tabulacao: [],
    por_campanha: [],
    serie_hora: [],
    ranking_operadores: [],
    vendas_por_campanha: rows.map((r) => ({ ...r, vb: r.vb ?? r.aprovadas })),
  };
}

describe('metas aprovadas', () => {
  it('respeita macroproduto e TODAS exclui OUTROS', () => {
    const p = payload('2026-09-01', [
      { campanha_op: 'PORTABILIDADE', aprovadas: 10 },
      { campanha_op: 'MIGRACAO', aprovadas: 4 },
      { campanha_op: 'ACAO_BKO', aprovadas: 2 },
      { campanha_op: 'OUTROS', aprovadas: 99 },
    ]);
    expect(aprovadasDoPayload(p, 'PORTABILIDADE')).toBe(10);
    expect(aprovadasDoPayload(p, 'TODAS')).toBe(16);
  });

  it('calcula MTD somente até a data de corte e deduplica snapshots por data', () => {
    const resumo = calcularMetaAprovadas({
      payloads: [
        payload('2026-09-01', [{ campanha_op: 'PORTABILIDADE', aprovadas: 10 }]),
        payload('2026-09-01', [{ campanha_op: 'PORTABILIDADE', aprovadas: 12 }]),
        payload('2026-09-02', [{ campanha_op: 'PORTABILIDADE', aprovadas: 8 }]),
        payload('2026-09-03', [{ campanha_op: 'PORTABILIDADE', aprovadas: 100 }]),
      ],
      campanha: 'PORTABILIDADE',
      metaMensal: 100,
      dataRef: '2026-09-02',
      expedienteHoras: 8,
      horaAtual: '21',
      diaEmAberto: false,
    });
    expect(resumo.aprovadasMes).toBe(20);
    expect(resumo.aprovadasDia).toBe(8);
    expect(resumo.atingimentoPct).toBe(20);
    expect(resumo.necessidadeMensal).toBe(80);
    expect(resumo.necessidadePorHora).toBe(0);
  });

  it('usa iSize uma única vez no fallback legado de Portabilidade', () => {
    const p = payload('2026-09-01', []);
    p.vendas_por_campanha = undefined;
    p.kpis_chamadas = { isize_cruzamento: true, isize_total: 20, isize_aceitas: 7 };
    p.jornada = [
      { campanha_op: 'PORTABILIDADE', aprovadas: 7 },
      { campanha_op: 'PORTABILIDADE', aprovadas: 7 },
    ] as EvaPayload['jornada'];
    expect(aprovadasDoPayload(p, 'PORTABILIDADE')).toBe(7);
  });

  it('sábado recebe metade do peso diário', () => {
    const sexta = calcularMetaAprovadas({
      payloads: [],
      campanha: 'ACAO_BKO',
      metaMensal: 1000,
      dataRef: '2026-09-04',
      expedienteHoras: 8,
      horaAtual: '09',
      diaEmAberto: true,
    });
    const sabado = calcularMetaAprovadas({
      payloads: [],
      campanha: 'ACAO_BKO',
      metaMensal: 1000,
      dataRef: '2026-09-05',
      expedienteHoras: 8,
      horaAtual: '09',
      diaEmAberto: true,
    });
    expect(sabado.necessidadeHoje).toBeCloseTo(sabado.necessidadePorDia * 0.5, 1);
    expect(sexta.necessidadeHoje).toBe(sexta.necessidadePorDia);
  });
});
