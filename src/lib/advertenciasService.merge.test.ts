import { describe, expect, it } from 'vitest';
import { mergeAdvertenciaPages } from './advertenciasService';
import type { Advertencia } from './advertenciasEscala';

function row(id: string, created_at: string): Advertencia {
  return {
    id,
    created_at,
    updated_at: created_at,
    data_ocorrido: created_at.slice(0, 10),
    colaborador_nome: 'X',
    nivel_idx: 1,
    motivo: 'm',
    status: 'pendente',
    anexos: [],
  } as unknown as Advertencia;
}

describe('mergeAdvertenciaPages', () => {
  it('anexa só ids novos', () => {
    const a = row('a', '2026-01-02T00:00:00Z');
    const b = row('b', '2026-01-01T00:00:00Z');
    const c = row('c', '2025-12-31T00:00:00Z');
    expect(mergeAdvertenciaPages([a, b], [b, c]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('lida com listas vazias', () => {
    const a = row('a', '2026-01-02T00:00:00Z');
    expect(mergeAdvertenciaPages([], [a])).toEqual([a]);
    expect(mergeAdvertenciaPages([a], [])).toEqual([a]);
  });
});
