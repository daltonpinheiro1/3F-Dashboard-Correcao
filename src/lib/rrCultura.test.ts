import { describe, expect, it } from 'vitest';
import { fraseDaCasa, podioBanco } from './rrCultura';

describe('fraseDaCasa', () => {
  it('monta ritmo, mix pior e ofensores', () => {
    expect(
      fraseDaCasa({
        gap: -18,
        pctMeta: 72,
        mix: [
          { id: 'port', label: 'Portabilidade', gap: -20 },
          { id: 'mig', label: 'Migração', gap: 2 },
        ],
        ofensores: 4,
      }),
    ).toBe('Abaixo -18 · 72% da meta · Port puxa o buraco · 4 ofensores na cadeira');
  });

  it('no ritmo não cita mix se ninguém está negativo', () => {
    expect(
      fraseDaCasa({
        gap: 5,
        pctMeta: 110,
        mix: [
          { id: 'port', label: 'Portabilidade', gap: 3 },
          { id: 'mig', label: 'Migração', gap: 2 },
        ],
        ofensores: 0,
      }),
    ).toBe('Acima +5 · 110% da meta');
  });
});

describe('podioBanco', () => {
  it('não repete nome no pódio e no banco', () => {
    const { podio, banco } = podioBanco([
      { supervisor: 'Ana', vendas: 20, metaDia: 10, gap: 10, pctMeta: 200 },
      { supervisor: 'Bruno', vendas: 4, metaDia: 20, gap: -16, pctMeta: 20 },
      { supervisor: 'Carla', vendas: 10, metaDia: 20, gap: -10, pctMeta: 50 },
      { supervisor: 'Duda', vendas: 18, metaDia: 20, gap: -2, pctMeta: 90 },
    ]);
    expect(podio.map((s) => s.supervisor)).toEqual(['Ana', 'Duda', 'Carla']);
    expect(banco.map((s) => s.supervisor)).toEqual(['Bruno']);
    expect(banco.every((b) => !podio.some((p) => p.supervisor === b.supervisor))).toBe(true);
  });
});
