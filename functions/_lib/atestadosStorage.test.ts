import { describe, expect, it } from 'vitest';
import {
  buildAtestadoStoragePath,
  buildAtestadoThumbStoragePath,
  gerarProtocoloAtestado,
  slugifyColaborador,
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
});
