import { describe, expect, it } from 'vitest';
import { agregarGerencialAno } from './atestadosGerencial';
import { agregarPorSupervisor } from './atestadosSupervisorGerencial';
import type { Atestado } from './atestadosEscala';

function mockRow(partial: Partial<Atestado>): Atestado {
  return {
    id: '1',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    protocolo: 'AT-2026-TEST01',
    colaborador_nome: 'Teste',
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 2,
    status: 'aprovado',
    ...partial,
  };
}

describe('atestadosGerencial', () => {
  it('agrega totais, INSS e taxa de aprovação', () => {
    const rows = [
      mockRow({ data_inicio: '2026-02-01', quantidade_dias: 2, tipo: 'medico' }),
      mockRow({
        id: '2',
        data_inicio: '2026-03-01',
        quantidade_dias: 20,
        status: 'protocolado',
      }),
      mockRow({ id: '3', data_inicio: '2025-12-01' }),
    ];
    const g = agregarGerencialAno(rows, 2026);
    expect(g.total).toBe(2);
    expect(g.inss_longos).toHaveLength(1);
    expect(g.taxa_aprovacao_pct).toBe(100);
    expect(g.por_tipo.medico.count).toBe(2);
  });

  it('duplicidades ignoram recusados independentemente da ordem', () => {
    const ativo = mockRow({ id: 'a', colaborador_matricula: 'M1', data_inicio: '2026-04-01', quantidade_dias: 3 });
    const recusado = mockRow({
      id: 'r',
      colaborador_matricula: 'M1',
      data_inicio: '2026-04-02',
      quantidade_dias: 1,
      status: 'recusado',
    });
    expect(agregarGerencialAno([recusado, ativo], 2026).duplicidades).toHaveLength(0);
    expect(agregarGerencialAno([ativo, recusado], 2026).duplicidades).toHaveLength(0);
    const outro = mockRow({ id: 'b', colaborador_matricula: 'M1', data_inicio: '2026-04-03', quantidade_dias: 1 });
    expect(agregarGerencialAno([ativo, recusado, outro], 2026).duplicidades).toHaveLength(1);
  });

  it('dias sem recusados fecham com a soma por supervisor', () => {
    const rows = [
      mockRow({ id: 'a', data_inicio: '2026-02-01', quantidade_dias: 3, colaborador_supervisor: 'S1' }),
      mockRow({ id: 'b', data_inicio: '2026-02-10', quantidade_dias: 5, status: 'recusado', colaborador_supervisor: 'S1' }),
      mockRow({ id: 'c', data_inicio: '2026-02-20', quantidade_dias: 0, data_fim: '2026-02-21', colaborador_supervisor: 'S2' }),
      mockRow({ id: 'd', data_inicio: '2026-02-22', unidade_periodo: 'horas', quantidade_horas: 4, colaborador_supervisor: 'S2' }),
    ];
    const g = agregarGerencialAno(rows, 2026);
    expect(g.total_dias).toBe(5);
    expect(g.total_horas).toBe(4);
    expect(g.recusados).toBe(1);
    const porSup = agregarPorSupervisor(rows, new Map());
    expect(porSup.reduce((s, x) => s + x.dias, 0)).toBe(g.total_dias);
  });

  it('INSS acumulado por CID-raiz e divergência de período', () => {
    const rows = [
      mockRow({ id: 'a', colaborador_matricula: 'M9', cid: 'F32.1', data_inicio: '2026-05-01', data_fim: '2026-05-10', quantidade_dias: 10 }),
      mockRow({ id: 'b', colaborador_matricula: 'M9', cid: 'F32', data_inicio: '2026-06-01', data_fim: '2026-06-08', quantidade_dias: 6 }),
      mockRow({ id: 'r', colaborador_matricula: 'M9', cid: 'F32', data_inicio: '2026-06-20', data_fim: '2026-07-20', status: 'recusado' }),
    ];
    const g = agregarGerencialAno(rows, 2026);
    expect(g.inss_alertas).toHaveLength(1);
    expect(g.inss_alertas[0].tipo).toBe('acumulado');
    expect(g.inss_alertas[0].dias_acumulados).toBe(18);
    expect(g.inss_longos.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(g.divergencias_periodo.map((d) => [d.atestado.id, d.calculado])).toEqual([['b', 8]]);
  });
});
