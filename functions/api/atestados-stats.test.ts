import { describe, expect, it } from 'vitest';
import { buildInssStatsPath } from './atestados-stats';

describe('atestados-stats (INSS)', () => {
  it('recorte do ano por data_inicio, sem recusados, só dias, paginado', () => {
    const q = new URLSearchParams(buildInssStatsPath(2026, 1000).split('?')[1]);
    expect(q.get('and')).toBe('(data_inicio.gte.2026-01-01,data_inicio.lte.2026-12-31)');
    expect(q.get('status')).toBe('neq.recusado');
    expect(q.get('unidade_periodo')).toBe('eq.dias');
    expect(q.get('offset')).toBe('1000');
    expect(q.get('select')).toContain('cid');
  });
});
