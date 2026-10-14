import { describe, expect, it, vi } from 'vitest';
import { lerPendentesKeyset, type PendenteRow } from './portabilidade-disparos';

const pagina = (desde: number, n: number): PendenteRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: desde + i, acao: 'consult' }));

describe('lerPendentesKeyset', () => {
  it('pagina por id=gt.<último> com order=id.asc (sem offset)', async () => {
    const buscar = vi.fn(async (p: Record<string, string>) => {
      if (!p.id) return pagina(1, 1000);
      if (p.id === 'gt.1000') return pagina(1001, 10);
      return [];
    });
    const r = await lerPendentesKeyset(buscar, 10);
    expect(r).toMatchObject({ truncado: false, erro: false });
    expect(r.rows).toHaveLength(1010);
    expect(buscar).toHaveBeenCalledTimes(2);
    const [p1, p2] = buscar.mock.calls.map((c) => c[0]);
    expect(p1).toMatchObject({ order: 'id.asc', status: 'eq.pendente' });
    expect(p1).not.toHaveProperty('offset');
    expect(p1).not.toHaveProperty('id');
    expect(p2.id).toBe('gt.1000');
  });

  it('página que falha sinaliza truncado (antes saía como leitura completa)', async () => {
    const buscar = vi.fn(async (p: Record<string, string>) => (p.id ? null : pagina(1, 1000)));
    const r = await lerPendentesKeyset(buscar, 10);
    expect(r).toMatchObject({ truncado: true, erro: true });
    expect(r.rows).toHaveLength(1000);
  });

  it('teto de páginas limita subrequests e marca truncado', async () => {
    let base = 1;
    const buscar = vi.fn(async () => {
      const b = pagina(base, 1000);
      base += 1000;
      return b;
    });
    const r = await lerPendentesKeyset(buscar, 4);
    expect(buscar).toHaveBeenCalledTimes(4);
    expect(r).toMatchObject({ truncado: true, erro: false });
  });

  it('última página cheia sem id numérico não entra em laço', async () => {
    const buscar = vi.fn(async () => Array.from({ length: 1000 }, () => ({ acao: 'open' })));
    const r = await lerPendentesKeyset(buscar, 10);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r.truncado).toBe(true);
  });
});
