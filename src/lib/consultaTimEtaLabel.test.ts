import { describe, expect, it } from 'vitest';
import {
  etaCardValue,
  etaDurationLabel,
  etaHintLabel,
  perQuerySeconds,
} from './consultaTimEta';

describe('consulta TIM ETA label', () => {
  it('mostra segundos abaixo de 1 min, sem til', () => {
    expect(etaDurationLabel(10)).toBe('10s');
    expect(etaDurationLabel(22)).toBe('22s');
    expect(etaDurationLabel(59)).toBe('59s');
    expect(etaCardValue(0, 22, 22)).toBe('22s');
    expect(etaHintLabel(0, 22, 22)).toBe('22s');
  });

  it('mostra minutos a partir de 60s, sem til', () => {
    expect(etaDurationLabel(60)).toBe('1 min');
    expect(etaDurationLabel(90)).toBe('2 min');
  });

  it('não força floor 45 no hint do bot', () => {
    expect(perQuerySeconds(22)).toBe(22);
    expect(perQuerySeconds(12)).toBe(12);
    expect(perQuerySeconds(9)).toBe(12);
    expect(perQuerySeconds(null)).toBe(22);
  });

  it('fallback local usa fila × média quando não há hint absoluto', () => {
    expect(etaCardValue(0, 22, null)).toBe('22s');
    // (2+1)*22 = 66s → ceil minutos = 2 min
    expect(etaCardValue(2, 22, null)).toBe('2 min');
  });
});
