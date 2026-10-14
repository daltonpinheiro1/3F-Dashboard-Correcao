import { describe, expect, it } from 'vitest';
import {
  cpcEvaJornada,
  deltaPct,
  janelaComparativo,
  montarComparativo,
  pontoDePayload,
  vendasEvaSerie,
} from './rrComparativos';
import type { EvaJornada, EvaPayload } from './evaDash';

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

  it('CPC usa cpc/tabuladas da jornada (mesma régua do hero), não total da série', () => {
    const jornada = [
      { campanha_op: 'PORTABILIDADE', cpc: 30, tabuladas: 60 },
      { campanha_op: 'MIGRACAO', cpc: 10, tabuladas: 40 },
      { campanha_op: 'ACAO_BKO', cpc: 90, tabuladas: 90 },
    ] as unknown as EvaJornada[];
    expect(cpcEvaJornada(jornada, 'TODAS')).toBe(40);
    const p = {
      serie_hora: [{ hora: '10', campanha_op: 'PORTABILIDADE', total: 1000, cpc: 30, sucesso: 3 }],
      jornada,
    } as unknown as EvaPayload;
    expect(pontoDePayload('2026-10-01', p, 'PORTABILIDADE').cpcPct).toBe(50);
  });
});
