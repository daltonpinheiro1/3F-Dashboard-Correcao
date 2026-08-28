import { describe, expect, it } from 'vitest';
import type { PeriodoRef } from './atestadosDuplicidade';
import { completarAnalisePeriodo, inferirDataFim } from './atestadosPeriodo';

describe('atestadosPeriodo', () => {
  it('calcula data_fim a partir de início + dias', () => {
    expect(
      inferirDataFim({
        data_inicio: '2026-08-28',
        quantidade_dias: 3,
        unidade_periodo: 'dias',
      }),
    ).toBe('2026-08-30');
  });

  it('completa análise sem data_fim', () => {
    const r = completarAnalisePeriodo({
      data_inicio: '2026-08-28',
      quantidade_dias: 2,
      unidade_periodo: 'dias',
    } as PeriodoRef & { quantidade_dias: number });
    expect(r.data_fim).toBe('2026-08-29');
  });

  it('infere quantidade de dias entre duas datas', () => {
    const r = completarAnalisePeriodo({
      data_inicio: '2026-03-01',
      data_fim: '2026-03-03',
      unidade_periodo: 'dias',
    } as PeriodoRef & { quantidade_dias?: number });
    expect(r.quantidade_dias).toBe(3);
  });
});
