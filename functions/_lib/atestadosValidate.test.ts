import { describe, expect, it } from 'vitest';
import { sanitizeAtestadoPost, validateAtestadoPost } from './atestadosValidate';

describe('atestadosValidate', () => {
  it('rejeita post sem colaborador', () => {
    const row = sanitizeAtestadoPost({ quantidade_dias: 2 });
    expect(validateAtestadoPost(row).ok).toBe(false);
  });

  it('aceita post com dias', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      quantidade_dias: 3,
      unidade_periodo: 'dias',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
  });

  it('completa data_fim a partir de início + dias', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      data_inicio: '2026-08-28',
      quantidade_dias: 3,
      unidade_periodo: 'dias',
    });
    expect(row.data_fim).toBe('2026-08-30');
  });

  it('aceita post com horas', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      quantidade_horas: 4,
      unidade_periodo: 'horas',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
  });
});
