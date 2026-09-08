import { describe, expect, it } from 'vitest';
import { comSortPorHora, tabHoraSortCol, valorCelulaTabHora } from './tabHoraMatriz';

const row = {
  nome: 'DESLIGOU',
  horas: { '09': 10, '10': 40, '11': 5 },
  pct_hora: { '09': 12.5, '10': 23.8, '11': 4 },
  tma_horas: { '09': 40, '10': 95, '11': 10 },
  horas_drop: { '09': 2, '10': 10, '11': 0 },
};

describe('valorCelulaTabHora', () => {
  it('em cada modo usa o número da célula, não o total do dia', () => {
    expect(valorCelulaTabHora(row, '10', 'pct')).toBe(23.8);
    expect(valorCelulaTabHora(row, '10', 'vol')).toBe(40);
    expect(valorCelulaTabHora(row, '10', 'drop')).toBe(25);
    expect(valorCelulaTabHora(row, '10', 'tma')).toBe(95);
  });

  it('hora vazia vale 0 (vai para o fim no desc)', () => {
    expect(valorCelulaTabHora(row, '21', 'vol')).toBe(0);
    expect(valorCelulaTabHora({}, '09', 'pct')).toBe(0);
  });
});

describe('comSortPorHora', () => {
  it('expõe _h_HH com a métrica ativa para o SortTh', () => {
    const [out] = comSortPorHora([row], ['09', '10'], 'pct');
    expect(tabHoraSortCol('10')).toBe('_h_10');
    expect((out as { _h_09?: number })._h_09).toBe(12.5);
    expect((out as { _h_10?: number })._h_10).toBe(23.8);
  });
});
