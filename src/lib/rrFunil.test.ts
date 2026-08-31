import { describe, expect, it } from 'vitest';
import { buildRrFunilDia } from './rrFunil';

describe('buildRrFunilDia', () => {
  it('monta etapas e % só na mesma janela', () => {
    const f = buildRrFunilDia({
      dialed: 1000,
      cpc: 400,
      sucessoEva: 80,
      aprovadas: 64,
      gross: 70,
      entregues: 200,
      portadoTim: 50,
    });
    expect(f.map((e) => e.id)).toEqual([
      'discagem',
      'cpc',
      'sucesso_eva',
      'crivo',
      'gross',
      'entrega',
      'portado',
    ]);
    expect(f.find((e) => e.id === 'cpc')?.pctDoAnterior).toBe(40);
    expect(f.find((e) => e.id === 'crivo')?.pctDoAnterior).toBe(80);
    expect(f.find((e) => e.id === 'gross')?.pctDoAnterior).toBeNull();
    expect(f.find((e) => e.id === 'entrega')?.janela).toBe('mes');
  });

  it('omite Gross/TIM quando não aplicável', () => {
    const f = buildRrFunilDia({
      dialed: 10,
      cpc: 4,
      sucessoEva: 1,
      aprovadas: 1,
      gross: null,
      entregues: null,
      portadoTim: null,
    });
    expect(f.some((e) => e.id === 'gross')).toBe(false);
    expect(f).toHaveLength(4);
  });
});
