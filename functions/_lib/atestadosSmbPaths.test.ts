import { describe, expect, it } from 'vitest';
import {
  resolveSmbFilesystemPath,
  toSmbRelativePath,
  toSmbUncPath,
} from './atestadosSmbPaths';

describe('atestadosSmbPaths', () => {
  it('remove prefixo Atestados para filesystem', () => {
    expect(toSmbRelativePath('Atestados/2026/08/28/joao_AT-2026-ABC.jpg')).toBe(
      '2026/08/28/joao_AT-2026-ABC.jpg',
    );
  });

  it('resolve caminho no mount macOS', () => {
    const p = resolveSmbFilesystemPath(
      '/Volumes/03 Operação/Atestados',
      'Atestados/2026/08/28/joao_AT-2026-ABC.jpg',
    );
    expect(p).toBe('/Volumes/03 Operação/Atestados/2026/08/28/joao_AT-2026-ABC.jpg');
  });

  it('gera UNC Windows', () => {
    expect(toSmbUncPath('Atestados/2026/08/28/a.jpg')).toMatch(
      /\\\\files\\03 Operação\\Atestados\\2026\\08\\28\\a\.jpg/,
    );
  });
});
