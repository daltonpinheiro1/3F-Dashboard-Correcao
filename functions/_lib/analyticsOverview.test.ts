import { describe, expect, it } from 'vitest';
import { aggregateForTest, filtroDataVendaBrt } from './analyticsOverview';

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

  it('filtro data_venda usa relógio BRT, não UTC nu', () => {
    const j = filtroDataVendaBrt('2026-09-01', '2026-09-01');
    expect(j?.gte).toBe('2026-09-01T00:00:00.000-03:00');
    expect(j?.lte).toBe('2026-09-01T23:59:59.999-03:00');
    expect(filtroDataVendaBrt('x', '2026-09-01')).toBeNull();
  });
});
