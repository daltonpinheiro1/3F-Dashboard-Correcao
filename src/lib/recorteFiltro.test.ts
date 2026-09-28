import { describe, expect, it } from 'vitest';
import {
  filtrosRecorteCubo,
  lerRecorte,
  limparRecorteParams,
  noRecorte,
  recorteAtivo,
  rotuloRecorte,
} from './recorteFiltro';

describe('recorteFiltro', () => {
  it('lê supervisor e equipe da URL', () => {
    const r = lerRecorte(new URLSearchParams('supervisor=Ana&equipe=E1&dateFrom=2026-09-01'));
    expect(r).toEqual({ supervisor: 'Ana', equipe: 'E1' });
    expect(recorteAtivo(r)).toBe(true);
    expect(rotuloRecorte(r)).toBe('Ana · E1');
    expect(recorteAtivo(lerRecorte(new URLSearchParams('')))).toBe(false);
  });

  it('casa supervisor e equipe exatos', () => {
    const r = { supervisor: 'Ana', equipe: 'E1' };
    expect(noRecorte({ supervisor: 'Ana', equipe: 'E1' }, r)).toBe(true);
    expect(noRecorte({ supervisor: 'Ana', equipe: 'E2' }, r)).toBe(false);
    expect(noRecorte({ supervisor: 'Ana Maria', equipe: 'E1' }, r)).toBe(false);
    expect(noRecorte({ supervisor: 'Ana', equipe: 'E2' }, { supervisor: 'Ana', equipe: '' })).toBe(true);
  });

  it('trata rótulos de vazio como null', () => {
    expect(noRecorte({ supervisor: null, equipe: null }, { supervisor: 'Sem supervisor', equipe: '-' })).toBe(true);
    expect(noRecorte({ supervisor: 'Ana', equipe: null }, { supervisor: 'Sem supervisor', equipe: '' })).toBe(false);
  });

  it('só manda eq ao servidor para valores reais', () => {
    expect(filtrosRecorteCubo({ supervisor: 'Ana', equipe: 'E1' })).toEqual([
      { column: 'supervisor', op: 'eq', value: 'Ana' },
      { column: 'equipe', op: 'eq', value: 'E1' },
    ]);
    expect(filtrosRecorteCubo({ supervisor: 'Sem supervisor', equipe: '-' })).toEqual([]);
  });

  it('limpa só supervisor e equipe', () => {
    const next = limparRecorteParams(new URLSearchParams('supervisor=Ana&equipe=E1&dateFrom=2026-09-01'));
    expect(next.toString()).toBe('dateFrom=2026-09-01');
  });
});
