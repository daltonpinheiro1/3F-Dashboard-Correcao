import { describe, expect, it } from 'vitest';
import { aggregateForTest, filtroDataVendaBrt, periodoAnalyticsInvalido } from './analyticsOverview';

describe('analyticsOverview estatística', () => {
  it('marca outlier e concentração Pareto', () => {
    const quiet = (sup: string) =>
      Array.from({ length: 20 }, (_, i) => ({
        tipos_erro: i < 2 ? ['cep'] : [],
        elapsed_ms: 80,
        supervisor: sup,
        equipe: 'B',
        data_venda: '2026-09-01',
      }));
    const rows = [
      ...Array.from({ length: 20 }, () => ({
        tipos_erro: ['cpf'],
        elapsed_ms: 100,
        supervisor: 'Ana',
        equipe: 'A',
        data_venda: '2026-09-01',
      })),
      ...quiet('Bia'),
      ...quiet('Cris'),
      ...quiet('Dani'),
    ];
    const a = aggregateForTest(rows);
    expect(a.concentracao_erro_pct).toBeGreaterThan(70);
    expect(a.pareto_erro[0]?.tipo).toBe('cpf');
    expect(a.pareto_corte_pct).toBe(60);
    expect(a.pareto_erro[a.pareto_erro.length - 1]?.acum_pct).toBeGreaterThanOrEqual(60);
    expect(a.outliers_supervisor.some((o) => o.supervisor === 'Ana')).toBe(true);
  });

  it('proposta só do Roboadm fica fora do total, como no cubo-overview', () => {
    const a = aggregateForTest([
      { proposta_id: 'p1', vendedor: 'Ana', tipos_erro: ['cep_incorreto'], supervisor: 'S', equipe: 'E' },
      { proposta_id: 'p2', vendedor: 'roboadm', tipos_erro: ['cep_incorreto'], supervisor: 'S', equipe: 'E' },
      { proposta_id: 'p3', vendedor: 'Bia', tipos_erro: [], supervisor: 'S', equipe: 'E' },
    ]);
    expect(a.total).toBe(2);
    expect(a.com_erro_operacional).toBe(1);
    expect(a.taxa_erro_pct).toBe(50);
    expect(a.por_supervisor[0]).toMatchObject({ total: 2, com_erro: 1 });
  });

  it('rejeita período ausente, inválido ou invertido', () => {
    expect(periodoAnalyticsInvalido('2026-09-01', '2026-09-30')).toBeNull();
    expect(periodoAnalyticsInvalido('2026-09-01', '2026-09-01')).toBeNull();
    expect(periodoAnalyticsInvalido('', '2026-09-01')).not.toBeNull();
    expect(periodoAnalyticsInvalido('2026-13-45', '2026-09-01')).not.toBeNull();
    expect(periodoAnalyticsInvalido('2026-09-30', '2026-09-01')).not.toBeNull();
  });

  it('filtro data_venda usa dia UTC, sem offset BRT', () => {
    const j = filtroDataVendaBrt('2026-09-01', '2026-09-01');
    expect(j?.gte).toBe('2026-09-01T00:00:00.000Z');
    expect(j?.lte).toBe('2026-09-01T23:59:59.999Z');
    expect(filtroDataVendaBrt('x', '2026-09-01')).toBeNull();
  });

  it('por_supervisor: top 30 + "Outros" fecha com o total', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({
      proposta_id: `p${i}`,
      vendedor: 'Ana',
      tipos_erro: i % 2 ? ['cep_incorreto'] : [],
      supervisor: `Sup ${String(i).padStart(2, '0')}`,
      equipe: 'E',
    }));
    const a = aggregateForTest(rows);
    expect(a.por_supervisor).toHaveLength(31);
    const outros = a.por_supervisor[30];
    expect(outros).toMatchObject({ supervisor: 'Outros', equipe: '5 equipes', total: 5 });
    expect(a.por_supervisor.reduce((soma, s) => soma + s.total, 0)).toBe(a.total);
    expect(a.por_supervisor.reduce((soma, s) => soma + s.com_erro, 0)).toBe(a.com_erro_operacional);
    expect(a.outliers_supervisor.some((o) => o.supervisor === 'Outros')).toBe(false);
  });

  it('tempo médio ignora passagens do Roboadm', () => {
    const a = aggregateForTest([
      { proposta_id: 'p1', vendedor: 'Ana', tipos_erro: [], elapsed_ms: 100 },
      { proposta_id: 'p1', vendedor: 'Roboadm3', tipos_erro: [], elapsed_ms: 9_000 },
      { proposta_id: 'p2', vendedor: 'Bia', tipos_erro: [], elapsed_ms: 300 },
    ]);
    expect(a.tempo_medio_ms).toBe(200);
  });
});
