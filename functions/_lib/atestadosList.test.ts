import { describe, expect, it } from 'vitest';
import { buildAtestadosPgListPath, sanitizeAtestadoStatus } from './atestadosList';

describe('atestadosList', () => {
  it('sanitizeAtestadoStatus allowlist', () => {
    expect(sanitizeAtestadoStatus('aprovado')).toBe('aprovado');
    expect(sanitizeAtestadoStatus('EM_ANALISE')).toBe('em_analise');
    expect(sanitizeAtestadoStatus('aprovado,id.neq.x')).toBeNull();
  });

  it('buildAtestadosPgListPath ignora status inválido e sanitiza colaborador', () => {
    const bad = buildAtestadosPgListPath({
      limit: 20,
      cursor: null,
      status: 'aprovado);select',
      colaborador: 'Jo*ão%(x)',
    });
    expect(bad).not.toContain('status=eq.');
    expect(decodeURIComponent(bad)).toContain('ilike.*Joãox*');
  });
});
