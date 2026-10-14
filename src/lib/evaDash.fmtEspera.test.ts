import { describe, expect, it } from 'vitest';
import { fmtDur, fmtEspera } from './evaDash';

describe('fmtEspera (espera média em segundos)', () => {
  it('abaixo de 1 min mostra segundos (fmtDur mostraria 0m)', () => {
    expect(fmtDur(44)).toBe('0m');
    expect(fmtEspera(44)).toBe('44s');
    expect(fmtEspera(44.6)).toBe('45s');
  });

  it('minutos com segundos', () => {
    expect(fmtEspera(65)).toBe('1m 05s');
    expect(fmtEspera(59.6)).toBe('1m 00s');
  });

  it('acima de 1h usa o formato de duração', () => {
    expect(fmtEspera(3725)).toBe(fmtDur(3725));
  });

  it('zero, negativo, NaN e Infinity', () => {
    expect(fmtEspera(0)).toBe('0s');
    expect(fmtEspera(-5)).toBe('0s');
    expect(fmtEspera(Number.NaN)).toBe('0s');
    expect(fmtEspera(Number.POSITIVE_INFINITY)).toBe('0s');
    expect(fmtEspera(null)).toBe('0s');
  });
});
