import { describe, expect, it } from 'vitest';
import { resolveMetaPortados, DEFAULT_META_PORTADOS_PCT } from './portabilidadeMeta';
import { buildProjecaoMes } from './portabilidadeProjecoes';

describe('resolveMetaPortados', () => {
  it('padrão 40% do universo', () => {
    const m = resolveMetaPortados({}, '2026-08', 6558);
    expect(m.portados_pct).toBe(DEFAULT_META_PORTADOS_PCT);
    expect(m.meta_portados).toBe(2623);
    expect(m.fonte).toBe('default');
  });

  it('env PORTABILIDADE_META_PORTADOS_PCT', () => {
    const m = resolveMetaPortados({ PORTABILIDADE_META_PORTADOS_PCT: '45' }, '2026-08', 1000);
    expect(m.portados_pct).toBe(45);
    expect(m.meta_portados).toBe(450);
    expect(m.fonte).toBe('env');
  });

  it('json por mês', () => {
    const m = resolveMetaPortados(
      { PORTABILIDADE_META_JSON: '{"2026-08":{"portados_pct":40}}' },
      '2026-08',
      5000,
    );
    expect(m.meta_portados).toBe(2000);
    expect(m.fonte).toBe('json');
  });
});

describe('buildProjecaoMes meta portados', () => {
  it('gauge 40% portados', () => {
    const p = buildProjecaoMes({
      mes: '2026-08',
      metaPortadosPct: 40,
      metaPortados: 2623,
      g: { portados: 753, falha_parcial: 165, sucesso_tim: 918, fechados: 3424 },
      rec: { universo: 6558, em_voo: 3134, fechados: 3424, soma_fatias: 6558, fecha: true, orfaos: 0 },
      serie: [],
      agora: new Date('2026-08-29T15:00:00Z'),
    });
    expect(p?.meta?.portados_pct).toBe(40);
    expect(p?.meta?.meta_portados).toBe(2623);
    expect(p?.meta?.taxa_atual_pct).toBe(11.5);
    expect(p?.meta?.gapRestante).toBe(1870);
  });
});
