import { describe, expect, it } from 'vitest';
import { reconcileDetalhe, reconcileGrossEvaSms } from './rrReconcile';

describe('reconcileGrossEvaSms', () => {
  it('alerta acima do limiar', () => {
    const r = reconcileGrossEvaSms(100, 50, 25);
    expect(r.alerta).toBe(true);
    expect(r.pct).toBe(50);
    expect(reconcileDetalhe(r)).toMatch(/EVA 100 vs SMS 50/);
  });

  it('dentro do limiar não alerta', () => {
    expect(reconcileGrossEvaSms(100, 90).alerta).toBe(false);
    expect(reconcileGrossEvaSms(0, 0).alerta).toBe(false);
  });
});
