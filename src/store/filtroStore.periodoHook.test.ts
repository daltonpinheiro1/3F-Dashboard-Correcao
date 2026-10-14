// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePeriodoCompartilhado, usePeriodoCompartilhadoStore } from './filtroStore';

const padrao = () => ({ dateFrom: '2026-10-01', dateTo: '2026-10-14' });

afterEach(() => {
  usePeriodoCompartilhadoStore.setState({ periodo: null });
});

describe('usePeriodoCompartilhado', () => {
  it('duas alterações no mesmo evento compartilham o período final', () => {
    const { result } = renderHook(() => usePeriodoCompartilhado(padrao));
    act(() => {
      result.current.setDateFrom('2026-09-01');
      result.current.setDateTo('2026-09-30');
    });
    expect(result.current.dateFrom).toBe('2026-09-01');
    expect(result.current.dateTo).toBe('2026-09-30');
    expect(usePeriodoCompartilhadoStore.getState().periodo).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  });

  it('campo apagado fica local e não sobrescreve o compartilhado', () => {
    const { result } = renderHook(() => usePeriodoCompartilhado(padrao));
    act(() => result.current.setPeriodo({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }));
    act(() => result.current.setDateTo(''));
    expect(result.current.dateTo).toBe('');
    expect(usePeriodoCompartilhadoStore.getState().periodo).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });
  });
});
