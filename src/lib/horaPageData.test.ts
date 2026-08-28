import { describe, expect, it } from 'vitest';
import {
  buildForecastDia,
  buildMonteCarloDia,
  horaKey,
  mergeSerie,
  motivoSourceLabel,
  vendasPorHoraFromSerie,
} from './horaPageData';
import type { EvaPayload, EvaSerieHora } from './evaDash';

describe('horaPageData', () => {
  it('horaKey normaliza', () => {
    expect(horaKey(9)).toBe('09');
    expect(horaKey('10')).toBe('10');
  });

  it('mergeSerie agrega por hora+campanha', () => {
    const hist = [
      {
        serie_hora: [
          { hora: '09', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso: 2 },
          { hora: '09', campanha_op: 'PORTABILIDADE', total: 4, cpc: 1, sucesso: 1 },
        ],
      },
    ] as unknown as EvaPayload[];
    const rows = mergeSerie(hist);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(14);
    expect(rows[0].cpc).toBe(6);
    expect(rows[0].pct_cpc).toBe(42.9);
  });

  it('motivoSourceLabel', () => {
    expect(motivoSourceLabel('operador_payload')).toBe('Operador');
    expect(motivoSourceLabel('x')).toBe('Indisponível');
  });

  it('buildForecastDia usa ritmo das últimas horas no cenário realista', () => {
    const serie = [
      { hora: '09', sucesso: 10, total: 20, cpc: 5, campanha_op: 'X' },
      { hora: '10', sucesso: 12, total: 20, cpc: 6, campanha_op: 'X' },
      { hora: '11', sucesso: 14, total: 20, cpc: 7, campanha_op: 'X' },
    ] as EvaSerieHora[];
    const fc = buildForecastDia(serie, 36, 3, 80);
    expect(fc?.realista).toBe(75); // 36 + ((12+14)/2)*3
    expect(fc?.otimista).toBe(78); // 36 + 14*3
    expect(fc?.pessimista).toBe(66); // 36 + 10*3
    expect(vendasPorHoraFromSerie(serie)).toEqual([10, 12, 14]);
  });

  it('buildMonteCarloDia calcula probabilidade sobre meta do dia', () => {
    const serie = [
      { hora: '09', sucesso: 10, total: 20, cpc: 5, campanha_op: 'X' },
      { hora: '10', sucesso: 12, total: 20, cpc: 6, campanha_op: 'X' },
      { hora: '11', sucesso: 14, total: 20, cpc: 7, campanha_op: 'X' },
    ] as EvaSerieHora[];
    const forecast = buildForecastDia(serie, 36, 3, 80);
    expect(forecast).not.toBeNull();
    let seed = 0;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const mc = buildMonteCarloDia(forecast!, vendasPorHoraFromSerie(serie), { sims: 500, rng });
    expect(mc?.meta).toBe(80);
    expect(mc?.forecastRealista).toBe(75);
    expect(mc?.projecaoP50).toBeGreaterThan(0);
    expect(mc?.probabilidade).toBeGreaterThanOrEqual(0);
    expect(mc?.probabilidade).toBeLessThanOrEqual(100);
  });
});
