import { describe, expect, it } from 'vitest';
import { diasAfastamentoContabil, divergenciaQuantidadeDias } from './atestadosDuplicidade';

describe('atestadosDuplicidade (client)', () => {
  it('divergência entre quantidade_dias e datas', () => {
    expect(
      divergenciaQuantidadeDias({ data_inicio: '2026-03-01', data_fim: '2026-03-05', quantidade_dias: 3, unidade_periodo: 'dias' }),
    ).toEqual({ declarado: 3, calculado: 5 });
    expect(
      divergenciaQuantidadeDias({ data_inicio: '2026-03-01', data_fim: '2026-03-05', quantidade_dias: 5, unidade_periodo: 'dias' }),
    ).toBeNull();
    expect(divergenciaQuantidadeDias({ data_inicio: '2026-03-01', quantidade_dias: 5, unidade_periodo: 'dias' })).toBeNull();
    expect(
      divergenciaQuantidadeDias({ data_inicio: '2026-03-01', data_fim: '2026-03-05', quantidade_dias: 2, unidade_periodo: 'horas' }),
    ).toBeNull();
  });

  it('dias contábeis: declarado, senão datas; horas = 0', () => {
    expect(diasAfastamentoContabil({ quantidade_dias: 3, data_inicio: '2026-03-01', data_fim: '2026-03-10', unidade_periodo: 'dias' })).toBe(3);
    expect(diasAfastamentoContabil({ quantidade_dias: 0, data_inicio: '2026-03-01', data_fim: '2026-03-10', unidade_periodo: 'dias' })).toBe(10);
    expect(diasAfastamentoContabil({ quantidade_dias: 4, unidade_periodo: 'horas' })).toBe(0);
  });
});
