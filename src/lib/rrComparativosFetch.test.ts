import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaPayload } from './evaDash';

const fetchEvaDia = vi.fn<(dia: string, signal?: AbortSignal) => Promise<EvaPayload | null>>();

vi.mock('./evaDash', async (importOriginal) => {
  const real = await importOriginal<typeof import('./evaDash')>();
  return { ...real, fetchEvaDia: (dia: string, signal?: AbortSignal) => fetchEvaDia(dia, signal) };
});

const { fetchRrComparativos, _resetRrComparativosCache } = await import('./rrComparativosFetch');

function payload(dia: string, sucesso: number): EvaPayload {
  return {
    data: dia,
    serie_hora: [{ hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso, pct_cpc: 50 }],
  } as unknown as EvaPayload;
}

describe('fetchRrComparativos', () => {
  beforeEach(() => {
    _resetRrComparativosCache();
    fetchEvaDia.mockReset();
    fetchEvaDia.mockImplementation(async (dia) => payload(dia, 10));
  });

  it('cache de histórico não congela o "hoje" do poll seguinte', async () => {
    const base = { dataRef: '2026-10-03', campanha: 'TODAS' as const };
    const a = await fetchRrComparativos({ ...base, hoje: { dia: '2026-10-03', vendas: 50, cpcPct: 40 } });
    expect(a.hoje.vendas).toBe(50);
    expect(a.mtdVendas).toBe(50 + 2 * 10);

    const chamadas = fetchEvaDia.mock.calls.length;
    const b = await fetchRrComparativos({ ...base, hoje: { dia: '2026-10-03', vendas: 80, cpcPct: 41 } });
    expect(fetchEvaDia.mock.calls.length).toBe(chamadas);
    expect(b.hoje.vendas).toBe(80);
    expect(b.mtdVendas).toBe(80 + 2 * 10);
    expect(b.vsD1Pct).toBe(700);
    expect(b.spark[b.spark.length - 1]?.vendas).toBe(80);
  });

  it('abort no meio não grava cache com dias zerados', async () => {
    const ac = new AbortController();
    fetchEvaDia.mockImplementation(async (dia) => {
      if (dia === '2026-10-05') ac.abort();
      return payload(dia, 10);
    });
    const base = { dataRef: '2026-10-14', campanha: 'TODAS' as const };
    await expect(
      fetchRrComparativos({ ...base, hoje: { dia: '2026-10-14', vendas: 5, cpcPct: 0 }, signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    fetchEvaDia.mockImplementation(async (dia) => payload(dia, 10));
    const ok = await fetchRrComparativos({ ...base, hoje: { dia: '2026-10-14', vendas: 5, cpcPct: 0 } });
    expect(ok.mtdVendas).toBe(5 + 13 * 10);
  });
});
