import { describe, expect, it } from 'vitest';
import type { EvaSerieHora } from './evaDash';
import { reconcileDetalhe, reconcileGrossEvaSms, vendasEvaReconcile } from './rrReconcile';

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

describe('vendasEvaReconcile', () => {
  const serie = [
    { hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 4, sucesso: 60, pct_cpc: 40 },
    { hora: '10', campanha_op: 'MIGRACAO', total: 10, cpc: 4, sucesso: 40, pct_cpc: 40 },
  ] as EvaSerieHora[];

  it('TODAS compara só Port com o Gross SMS (universo Portabilidade) — Mig não gera falso alerta', () => {
    const eva = vendasEvaReconcile({ campanha: 'TODAS', vendasRecorte: 100, serie });
    expect(eva).toBe(60);
    expect(reconcileGrossEvaSms(eva, 60).alerta).toBe(false);
  });

  it('recorte Port mantém as vendas do recorte', () => {
    expect(vendasEvaReconcile({ campanha: 'PORTABILIDADE', vendasRecorte: 58, serie })).toBe(58);
  });
});
