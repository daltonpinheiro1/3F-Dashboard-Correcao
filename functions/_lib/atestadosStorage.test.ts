import { describe, expect, it } from 'vitest';
import {
  buildAtestadoStoragePath,
  buildAtestadoThumbStoragePath,
  decodeImageBase64,
  gerarProtocoloAtestado,
  slugifyColaborador,
  sniffAtestadoMime,
} from '../../functions/_lib/atestadosStorage';

describe('atestadosStorage', () => {
  it('slugifyColaborador remove acentos e espaços', () => {
    expect(slugifyColaborador('João da Silva')).toBe('joao_da_silva');
  });

  it('buildAtestadoStoragePath usa Ano/Mes/Dia/nome', () => {
    const path = buildAtestadoStoragePath({
      basePath: 'rh/atestados',
      dataReferencia: '2026-03-15',
      colaboradorNome: 'Maria Souza',
      protocolo: 'AT-2026-ABC123',
      mime: 'image/jpeg',
    });
    expect(path).toBe('rh/atestados/2026/03/15/maria_souza_AT-2026-ABC123.jpg');
    const local = buildAtestadoStoragePath({
      basePath: 'Atestados',
      dataReferencia: '2026-03-15',
      colaboradorNome: 'Maria Souza',
      protocolo: 'AT-2026-ABC123',
      mime: 'image/jpeg',
    });
    expect(local).toBe('Atestados/2026/03/15/maria_souza_AT-2026-ABC123.jpg');
    expect(buildAtestadoThumbStoragePath(local)).toBe(
      'Atestados/2026/03/15/maria_souza_AT-2026-ABC123_thumb.jpg',
    );
  });

  it('gerarProtocoloAtestado segue formato AT-ANO-HEX', () => {
    const p = gerarProtocoloAtestado(new Date('2026-08-28T12:00:00Z'));
    expect(p).toMatch(/^AT-2026-[A-F0-9]{6}$/);
  });

  const b64 = (bytes: number[]) => {
    const full = new Uint8Array(128);
    full.set(bytes);
    return btoa(String.fromCharCode(...full));
  };

  it('decodeImageBase64 rejeita conteúdo que não é imagem/PDF mesmo com MIME declarado', () => {
    const html = Array.from('<html><script>alert(1)</script></html>', (c) => c.charCodeAt(0));
    const r = decodeImageBase64(`data:image/jpeg;base64,${b64(html)}`);
    expect(r.ok).toBe(false);
    const pdfFake = decodeImageBase64(`data:application/pdf;base64,${b64(html)}`);
    expect(pdfFake.ok).toBe(false);
  });

  it('decodeImageBase64 usa o MIME real dos magic bytes', () => {
    const jpeg = decodeImageBase64(`data:image/png;base64,${b64([0xff, 0xd8, 0xff, 0xe0])}`);
    expect(jpeg.ok && jpeg.mime).toBe('image/jpeg');
    const pdf = decodeImageBase64(`data:application/pdf;base64,${b64([0x25, 0x50, 0x44, 0x46, 0x2d])}`);
    expect(pdf.ok && pdf.mime).toBe('application/pdf');
    const png = decodeImageBase64(
      `data:image/png;base64,${b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])}`,
    );
    expect(png.ok && png.mime).toBe('image/png');
  });

  it('sniffAtestadoMime aceita %PDF após bytes iniciais (até 1 KB)', () => {
    const bytes = new Uint8Array(200);
    bytes.set([0xef, 0xbb, 0xbf, 0x25, 0x50, 0x44, 0x46]);
    expect(sniffAtestadoMime(bytes)).toBe('application/pdf');
  });
});
