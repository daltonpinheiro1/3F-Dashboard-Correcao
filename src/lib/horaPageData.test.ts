import { describe, expect, it } from 'vitest';
import { horaKey, mergeSerie, motivoSourceLabel } from './horaPageData';
import type { EvaPayload } from './evaDash';

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
});
