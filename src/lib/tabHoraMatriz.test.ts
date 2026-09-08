import { describe, expect, it } from 'vitest';
import {
  comSortPorHora,
  fmtDropCelula,
  fmtEventoDropCelula,
  rowTemDropAgente,
  tabHoraSortCol,
  valorCelulaTabHora,
} from './tabHoraMatriz';

const row = {
  nome: 'DESLIGOU',
  horas: { '09': 10, '10': 40, '11': 5 },
  pct_hora: { '09': 12.5, '10': 23.8, '11': 4 },
  tma_horas: { '09': 40, '10': 95, '11': 10 },
  horas_drop: { '09': 2, '10': 10, '11': 0 },
  drop_total: 12,
};

describe('valorCelulaTabHora', () => {
  it('em cada modo usa o número da célula, não o total do dia', () => {
    expect(valorCelulaTabHora(row, '10', 'pct')).toBe(23.8);
    expect(valorCelulaTabHora(row, '10', 'vol')).toBe(40);
    expect(valorCelulaTabHora(row, '10', 'drop')).toBe(10);
    expect(valorCelulaTabHora(row, '10', 'tma')).toBe(95);
  });

  it('hora vazia vale 0 (vai para o fim no desc)', () => {
    expect(valorCelulaTabHora(row, '21', 'vol')).toBe(0);
    expect(valorCelulaTabHora({}, '09', 'pct')).toBe(0);
    expect(valorCelulaTabHora(row, '11', 'drop')).toBe(0);
  });

  it('sem bit, fallback de evento ordena pelo volume da tab queda/desligou', () => {
    const evento = {
      nome: '12 - DESLIGOU SEM OUVIR PROPOSTA',
      horas: { '13': 18 },
      horas_drop: { '13': 0 },
    };
    const outro = { nome: '26 - SEM INTERESSE', horas: { '13': 90 }, horas_drop: { '13': 0 } };
    expect(valorCelulaTabHora(evento, '13', 'drop')).toBe(0);
    expect(valorCelulaTabHora(evento, '13', 'drop', { dropFallbackEvento: true })).toBe(18);
    expect(valorCelulaTabHora(outro, '13', 'drop', { dropFallbackEvento: true })).toBe(0);
  });
});

describe('fmtDropCelula', () => {
  it('mostra qtd · % só quando houve Agente Desligou', () => {
    expect(fmtDropCelula(10, 40)).toBe('10 · 25%');
    expect(fmtDropCelula(0, 40)).toBe('—');
    expect(fmtDropCelula(0, 0)).toBe('');
  });
});

describe('fmtEventoDropCelula', () => {
  it('mostra volume do evento, não 0% de DROP agente', () => {
    expect(fmtEventoDropCelula(18, 12.5)).toBe('18 · 12.5%');
    expect(fmtEventoDropCelula(0, 12.5)).toBe('');
  });
});

describe('rowTemDropAgente', () => {
  it('detecta bit na linha', () => {
    expect(rowTemDropAgente(row)).toBe(true);
    expect(rowTemDropAgente({ horas_drop: { '09': 0 } })).toBe(false);
  });
});

describe('comSortPorHora', () => {
  it('expõe _h_HH com a métrica ativa para o SortTh', () => {
    const [out] = comSortPorHora([row], ['09', '10'], 'pct');
    expect(tabHoraSortCol('10')).toBe('_h_10');
    expect((out as { _h_09?: number })._h_09).toBe(12.5);
    expect((out as { _h_10?: number })._h_10).toBe(23.8);
  });

  it('em DROP ordena pela qtd Agente Desligou da hora', () => {
    const [out] = comSortPorHora([row], ['10'], 'drop');
    expect((out as { _h_10?: number })._h_10).toBe(10);
  });
});
