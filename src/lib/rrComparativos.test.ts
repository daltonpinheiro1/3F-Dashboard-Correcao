import { describe, expect, it } from 'vitest';
import { deltaPct, janelaComparativo, montarComparativo, vendasEvaSerie } from './rrComparativos';

describe('rrComparativos', () => {
  it('janela D-1 D-7 spark 7 dias', () => {
    const j = janelaComparativo('2026-08-31');
    expect(j.d1).toBe('2026-08-30');
    expect(j.d7).toBe('2026-08-24');
    expect(j.spark).toHaveLength(7);
    expect(j.spark[0]).toBe('2026-08-25');
    expect(j.spark[6]).toBe('2026-08-31');
  });

  it('deltaPct e MTD', () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(10, 0)).toBeNull();
    const c = montarComparativo({
      hoje: { dia: '2026-08-31', vendas: 120, cpcPct: 40 },
      d1: { dia: '2026-08-30', vendas: 100, cpcPct: 38 },
      d7: { dia: '2026-08-24', vendas: 90, cpcPct: 41 },
      spark: [],
      mtdVendas: 1500,
    });
    expect(c.vsD1Pct).toBe(20);
    expect(c.mtdVendas).toBe(1500);
  });

  it('vendasEvaSerie ignora BKO em TODAS', () => {
    const n = vendasEvaSerie(
      [
        { hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 4, sucesso: 2, pct_cpc: 40 },
        { hora: '10', campanha_op: 'ACAO_BKO', total: 10, cpc: 4, sucesso: 50, pct_cpc: 40 },
      ],
      'TODAS',
    );
    expect(n).toBe(2);
  });
});
