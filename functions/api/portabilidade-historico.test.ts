import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deltaTaxaPct,
  parseMeses,
  sbCountPropostasUnicas,
  taxaPortadoSobreUniverso,
} from './portabilidade-historico';

afterEach(() => vi.unstubAllGlobals());

describe('parseMeses', () => {
  it('inválido cai no padrão 3 (antes NaN → série vazia)', () => {
    expect(parseMeses('abc')).toBe(3);
    expect(parseMeses(null)).toBe(3);
    expect(parseMeses('')).toBe(3);
  });

  it('respeita 3..12', () => {
    expect(parseMeses('6')).toBe(6);
    expect(parseMeses('1')).toBe(3);
    expect(parseMeses('99')).toBe(12);
    expect(parseMeses('7.9')).toBe(7);
  });
});

describe('taxaPortadoSobreUniverso', () => {
  it('sem universo devolve null em vez de trocar para base fechados', () => {
    expect(taxaPortadoSobreUniverso(100, null)).toBeNull();
    expect(taxaPortadoSobreUniverso(100, 0)).toBeNull();
    expect(taxaPortadoSobreUniverso(100, 2000)).toBe(5);
  });

  it('delta com taxa ausente é null', () => {
    expect(deltaTaxaPct(null, 5)).toBeNull();
    expect(deltaTaxaPct(7.25, 5)).toBe(2.3);
  });
});

describe('sbCountPropostasUnicas', () => {
  const cfg = { url: 'https://port.test', key: 'k' };

  it('sinaliza truncado quando bate o teto de páginas', async () => {
    let page = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const base = page++ * 1000;
        return Response.json(
          Array.from({ length: 1000 }, (_, i) => ({ proposta_isize: `3F-${base + i}` })),
        );
      }),
    );
    const r = await sbCountPropostasUnicas(cfg, 'consultas_enviadas_pos_aceite', {}, 2);
    expect(r).toEqual({ n: 2000, truncado: true });
  });

  it('dedup 3F-N/N e leitura completa não trunca', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([{ proposta_isize: '3F-1' }, { proposta_isize: '1' }, { proposta_isize: '3F-2' }]),
      ),
    );
    const r = await sbCountPropostasUnicas(cfg, 'consultas_enviadas_pos_aceite', {});
    expect(r).toEqual({ n: 2, truncado: false });
  });
});
