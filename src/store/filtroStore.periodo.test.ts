import { describe, expect, it, vi } from 'vitest';

const armazenado = vi.hoisted(() => {
  const mapa = new Map<string, string>([
    ['3f-periodo-compartilhado', JSON.stringify({ state: { periodo: { dateFrom: '2026-10-09', dateTo: '' } }, version: 1 })],
  ]);
  globalThis.sessionStorage = {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => { mapa.set(k, v); },
    removeItem: (k: string) => { mapa.delete(k); },
    clear: () => mapa.clear(),
    key: () => null,
    get length() { return mapa.size; },
  } as Storage;
  return mapa;
});

import { usePeriodoCompartilhadoStore } from './filtroStore';

describe('usePeriodoCompartilhadoStore', () => {
  it('descarta período incompleto salvo na sessão', () => {
    expect(usePeriodoCompartilhadoStore.getState().periodo).toBeNull();
  });

  it('persiste o período escolhido no sessionStorage', () => {
    usePeriodoCompartilhadoStore.getState().setPeriodo({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    const salvo = JSON.parse(armazenado.get('3f-periodo-compartilhado') || '{}');
    expect(salvo.state.periodo).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(salvo.state.setPeriodo).toBeUndefined();
  });
});
