import { describe, expect, it, vi } from 'vitest';
import { buscarDiaComparavel } from './horaPageData';
import type { EvaPayload } from './evaDash';

const comSerie = (data: string) =>
  ({ data, serie_hora: [{ hora: '09', total: 10 }], kpis_chamadas: {} }) as unknown as EvaPayload;

describe('buscarDiaComparavel', () => {
  it('snapshot D-1 inválido (422/5xx) não derruba: segue para D-2', async () => {
    const fetchDia = vi.fn(async (iso: string) => {
      if (iso === '2026-10-13') throw new Error('Snapshot EVA 2026-10-13 inválido');
      return comSerie(iso);
    });
    const r = await buscarDiaComparavel('2026-10-14', fetchDia);
    expect(r.iso).toBe('2026-10-12');
    expect(r.payload?.data).toBe('2026-10-12');
  });

  it('pula dia sem volume (domingo/stub) e para em maxBack', async () => {
    const fetchDia = vi.fn(async () => ({ data: 'x', serie_hora: [], kpis_chamadas: { tabuladas: 0 } }) as unknown as EvaPayload);
    const r = await buscarDiaComparavel('2026-10-14', fetchDia, { maxBack: 3 });
    expect(r).toEqual({ payload: null, iso: '' });
    expect(fetchDia).toHaveBeenCalledTimes(3);
  });

  it('cancelado interrompe sem novas leituras', async () => {
    const fetchDia = vi.fn(async () => null);
    const r = await buscarDiaComparavel('2026-10-14', fetchDia, { cancelado: () => true });
    expect(r.payload).toBeNull();
    expect(fetchDia).not.toHaveBeenCalled();
  });
});
