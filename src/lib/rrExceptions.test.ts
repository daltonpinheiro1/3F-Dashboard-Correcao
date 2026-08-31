import { describe, expect, it } from 'vitest';
import { buildRrExceptions } from './rrExceptions';

describe('buildRrExceptions', () => {
  it('só emite vermelhos (exception-based)', () => {
    expect(
      buildRrExceptions({
        taxaErroPct: 3,
        emTransito: 10,
        funilUniverso: 1000,
        gap: 5,
        ofensoresCriticos: 0,
      }),
    ).toEqual([]);
  });

  it('erro ≥ 15 é crítico; gap negativo entra', () => {
    const xs = buildRrExceptions({
      taxaErroPct: 16,
      emTransito: 0,
      funilUniverso: 100,
      gap: -25,
      ofensoresCriticos: 2,
      stale: true,
      reconcileAlerta: true,
      reconcileDetalhe: 'delta 40%',
    });
    expect(xs.map((x) => x.id).sort()).toEqual(
      ['erro_critico', 'gap_meta', 'live_stale', 'ofensor_p0', 'reconcile'].sort(),
    );
    expect(xs.find((x) => x.id === 'gap_meta')?.nivel).toBe('critico');
    expect(xs.find((x) => x.id === 'ofensor_p0')?.href).toBe('/hora');
    expect(xs.find((x) => x.id === 'erro_critico')?.href).toBe('/erros');
  });

  it('não usa Gross/erro se 360 não aplicável', () => {
    const xs = buildRrExceptions({
      taxaErroPct: 20,
      emTransito: 500,
      funilUniverso: 1000,
      gap: 0,
      ofensoresCriticos: 0,
      aplicavel360: false,
    });
    expect(xs.some((x) => x.id.startsWith('erro'))).toBe(false);
    expect(xs.some((x) => x.id === 'transito')).toBe(false);
  });
});
