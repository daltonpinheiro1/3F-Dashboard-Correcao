import { describe, expect, it } from 'vitest';
import {
  anosEntre,
  buildAtestadosPgAnoExtremoPath,
  buildAtestadosPgCountPaths,
  buildAtestadosPgListPath,
  countFromContentRange,
  sanitizeAtestadoStatus,
  somarAtestadosTotais,
  validarAtestadosFiltros,
} from './atestadosList';

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

describe('atestadosList (totais do recorte)', () => {
  it('validarAtestadosFiltros: tamanho, mínimo p/ não-admin e ano', () => {
    const sp = (qs: string) => new URLSearchParams(qs);
    expect(validarAtestadosFiltros(sp(`colaborador=${'a'.repeat(81)}`), true)).toMatch(/excede/);
    expect(validarAtestadosFiltros(sp('colaborador=a'), false)).toMatch(/2 caracteres/);
    expect(validarAtestadosFiltros(sp('colaborador=a'), true)).toBeNull();
    expect(validarAtestadosFiltros(sp('ano=2026);x'), true)).toMatch(/ano inválido/);
    expect(validarAtestadosFiltros(sp('ano=2026&colaborador=Ana'), false)).toBeNull();
  });

  it('count paths mantêm escopo criado_por_email e filtros em cada status', () => {
    const paths = buildAtestadosPgCountPaths({
      colaborador: 'Ana',
      criado_por_email: 'Sup@3F.com',
    });
    expect(Object.keys(paths).sort()).toEqual(['aprovado', 'arquivado', 'em_analise', 'protocolado', 'recusado']);
    const q = new URLSearchParams(paths.aprovado!.split('?')[1]);
    expect(q.get('criado_por_email')).toBe('eq.sup@3f.com');
    expect(q.get('status')).toBe('eq.aprovado');
    expect(q.get('colaborador_nome')).toBe('ilike.*Ana*');
    expect(q.get('select')).toBe('id');
  });

  it('count paths com status filtrado só consultam aquele status', () => {
    expect(Object.keys(buildAtestadosPgCountPaths({ status: 'recusado' }))).toEqual(['recusado']);
    expect(Object.keys(buildAtestadosPgCountPaths({ status: 'x);drop' }))).toHaveLength(5);
  });

  it('countFromContentRange e somarAtestadosTotais', () => {
    expect(countFromContentRange('0-0/42')).toBe(42);
    expect(countFromContentRange('*/0')).toBe(0);
    expect(countFromContentRange(null)).toBeNull();
    expect(somarAtestadosTotais({ protocolado: 2, em_analise: 1, aprovado: 5 })).toEqual({
      total: 8,
      protocolado: 2,
      em_analise: 1,
      aprovado: 5,
      recusado: 0,
      arquivado: 0,
    });
  });

  it('anos: extremo respeita escopo e anosEntre inclui o ano corrente', () => {
    const q = new URLSearchParams(buildAtestadosPgAnoExtremoPath('asc', 'sup@3f.com').split('?')[1]);
    expect(q.get('criado_por_email')).toBe('eq.sup@3f.com');
    expect(q.get('order')).toBe('data_inicio.asc');
    expect(anosEntre('2023-05-01', '2025-01-10', 2026)).toEqual([2026, 2025, 2024, 2023]);
    expect(anosEntre(null, null, 2026)).toEqual([2026]);
    expect(anosEntre('1800-01-01', 'lixo', 2026)).toEqual([2026]);
    expect(anosEntre('1900-01-01', null, 2026)).toHaveLength(30);
  });
});
