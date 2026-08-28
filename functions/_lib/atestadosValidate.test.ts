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

  it('aceita post com horas', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      quantidade_horas: 4,
      unidade_periodo: 'horas',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
  });
});
