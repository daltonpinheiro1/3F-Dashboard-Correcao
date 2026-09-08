import { describe, expect, it } from 'vitest';
import { cycleSortState } from './tableSort';

describe('cycleSortState', () => {
  it('texto: 1º clique A→Z, 2º Z→A, 3º limpa', () => {
    const a = cycleSortState(null, 'asc', 'nome');
    expect(a).toEqual({ sortKey: 'nome', sortDir: 'asc' });
    const b = cycleSortState(a.sortKey, a.sortDir, 'nome');
    expect(b).toEqual({ sortKey: 'nome', sortDir: 'desc' });
    expect(cycleSortState(b.sortKey, b.sortDir, 'nome')).toEqual({ sortKey: null, sortDir: 'asc' });
  });

  it('número (firstDir desc): 1º maior→menor, 2º menor→maior', () => {
    const a = cycleSortState('total', 'desc', '_h_10', 'desc');
    expect(a).toEqual({ sortKey: '_h_10', sortDir: 'desc' });
    const b = cycleSortState(a.sortKey, a.sortDir, '_h_10', 'desc');
    expect(b).toEqual({ sortKey: '_h_10', sortDir: 'asc' });
  });
});
