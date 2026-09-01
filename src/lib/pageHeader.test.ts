import { describe, expect, it } from 'vitest';
import { mergePageMeta } from './pageHeader';

describe('mergePageMeta (anti React #185)', () => {
  it('retorna prev quando título e subtítulo iguais', () => {
    const prev = { title: 'Operação', subtitle: 'Live' };
    expect(mergePageMeta(prev, { title: 'Operação', subtitle: 'Live' })).toBe(prev);
  });

  it('normaliza subtitle ausente vs vazio', () => {
    const prev = { title: 'Dashboard' };
    expect(mergePageMeta(prev, { title: 'Dashboard', subtitle: '' })).toBe(prev);
    const prev2 = { title: 'Dashboard', subtitle: '' };
    expect(mergePageMeta(prev2, { title: 'Dashboard' })).toBe(prev2);
  });

  it('cria novo objeto quando título ou subtítulo mudam', () => {
    const prev = { title: 'A', subtitle: 'x' };
    const next = mergePageMeta(prev, { title: 'B', subtitle: 'x' });
    expect(next).not.toBe(prev);
    expect(next.title).toBe('B');
  });
});
