import { describe, expect, it } from 'vitest';
import { atestadoFileKind, resolveAtestadoKind, sniffAtestadoMagic, validateAtestadoFile } from './atestadosStorage';

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

  it('aceita HEIC/AVIF da câmera Pixel; arquivo sem MIME espera sniff', () => {
    expect(atestadoFileKind(new File(['x'], 'IMG_001.heic', { type: 'image/heic' }))).toBe('image');
    expect(atestadoFileKind(new File(['x'], 'foto.avif', { type: 'image/avif' }))).toBe('image');
    expect(atestadoFileKind(new File(['x'], 'image', { type: '' }))).toBe('unknown');
  });

  it('recusa formato fora da lista', () => {
    const result = validateAtestadoFile(new File(['x'], 'atestado.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    expect(result.ok).toBe(false);
  });

  it('sniff reconhece JPEG, PDF e HEIC pelo magic (câmera sem MIME)', () => {
    expect(sniffAtestadoMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image');
    expect(sniffAtestadoMagic(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBe('pdf');
    const heic = new Uint8Array(12);
    heic.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(sniffAtestadoMagic(heic)).toBe('image');
    expect(sniffAtestadoMagic(new Uint8Array([0x00, 0x01, 0x02]))).toBe('unknown');
  });

  it('resolveAtestadoKind: magic JPEG vence extensão .pdf', () => {
    const jpegAsPdf = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'scan.pdf', {
      type: 'application/pdf',
    });
    expect(atestadoFileKind(jpegAsPdf)).toBe('pdf');
    expect(resolveAtestadoKind(jpegAsPdf, 'image')).toBe('image');
    expect(resolveAtestadoKind(jpegAsPdf, 'unknown')).toBe('pdf');
  });
});
