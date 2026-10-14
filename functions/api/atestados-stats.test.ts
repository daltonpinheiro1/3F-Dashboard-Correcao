import { describe, expect, it } from 'vitest';
import { canAccessAbaFor } from '../../shared/abasCatalog';
import { ABAS_ATESTADOS_STATS, buildInssStatsPath } from './atestados-stats';

describe('atestados-stats (INSS)', () => {
  it('recorte do ano por data_inicio, sem recusados, só dias, paginado', () => {
    const q = new URLSearchParams(buildInssStatsPath(2026, 1000).split('?')[1]);
    expect(q.get('and')).toBe('(data_inicio.gte.2026-01-01,data_inicio.lte.2026-12-31)');
    expect(q.get('status')).toBe('neq.recusado');
    expect(q.get('unidade_periodo')).toBe('eq.dias');
    expect(q.get('offset')).toBe('1000');
    expect(q.get('select')).toContain('cid');
  });

  it('contadores liberados para quem vê Atestados ou Inteligência, não para viewer sem perfil', () => {
    const pode = (role: string, abas?: string[]) =>
      ABAS_ATESTADOS_STATS.some((aba) => canAccessAbaFor({ role, abas }, aba));
    expect(pode('admin')).toBe(true);
    expect(pode('supervisor')).toBe(true);
    expect(pode('viewer')).toBe(false);
    expect(pode('viewer', ['atestados'])).toBe(true);
  });
});
