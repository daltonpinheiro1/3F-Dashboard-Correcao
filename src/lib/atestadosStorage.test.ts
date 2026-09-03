import { describe, expect, it } from 'vitest';
import { atestadoFileKind, validateAtestadoFile } from './atestadosStorage';

describe('atestadosStorage', () => {
  it('aceita PDF digital mesmo quando o navegador não informa o MIME', () => {
    const file = new File(['%PDF-1.4 conteúdo'], 'atestado-web.pdf', { type: '' });
    expect(atestadoFileKind(file)).toBe('pdf');
    expect(validateAtestadoFile(file)).toEqual({ ok: true });
  });

  it('aceita WEBP pelo MIME ou extensão', () => {
    expect(atestadoFileKind(new File(['img'], 'atestado.webp', { type: '' }))).toBe('image');
    expect(atestadoFileKind(new File(['img'], 'sem-extensao', { type: 'image/webp' }))).toBe('image');
  });

  it('recusa formato fora da lista', () => {
    const result = validateAtestadoFile(new File(['x'], 'atestado.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    expect(result.ok).toBe(false);
  });
});
