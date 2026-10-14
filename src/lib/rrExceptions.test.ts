import { describe, expect, it } from 'vitest';
import { buildRrExceptions, PROB_META_HORA_MIN, PROB_META_LIMIAR } from './rrExceptions';

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

  describe('alerta preditivo (Monte Carlo, sem LLM)', () => {
    const base = { taxaErroPct: 0, emTransito: 0, funilUniverso: 0, gap: 0, ofensoresCriticos: 0 };

    it('dispara abaixo de 35% a partir das 12h, com dono', () => {
      const xs = buildRrExceptions({
        ...base,
        probMeta: 20,
        horaBrt: 12,
        forecastRealista: 180,
        metaDia: 300,
        supervisorDono: 'Bruno',
      });
      const x = xs.find((e) => e.id === 'prob_meta_baixa');
      expect(x?.nivel).toBe('alto');
      expect(x?.dono).toBe('Bruno');
      expect(x?.titulo).toContain('20%');
      expect(x?.detalhe).toContain('Forecast realista 180 de meta 300');
    });

    it('abaixo de 15% é crítico', () => {
      const xs = buildRrExceptions({ ...base, probMeta: 10, horaBrt: 15 });
      expect(xs.find((e) => e.id === 'prob_meta_baixa')?.nivel).toBe('critico');
    });

    it('não dispara antes das 12h, no limiar ou sem probabilidade', () => {
      expect(PROB_META_LIMIAR).toBe(35);
      expect(PROB_META_HORA_MIN).toBe(12);
      const ids = (o: Partial<Parameters<typeof buildRrExceptions>[0]>) =>
        buildRrExceptions({ ...base, ...o }).map((e) => e.id);
      expect(ids({ probMeta: 10, horaBrt: 11 })).not.toContain('prob_meta_baixa');
      expect(ids({ probMeta: 35, horaBrt: 14 })).not.toContain('prob_meta_baixa');
      expect(ids({ probMeta: null, horaBrt: 14 })).not.toContain('prob_meta_baixa');
    });
  });
});
