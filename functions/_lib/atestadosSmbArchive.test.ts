import { describe, expect, it } from 'vitest';
import {
  buildAtestadoCloudArchivePath,
  buildAtestadoStoragePath,
} from './atestadosStorage';

describe('buildAtestadoCloudArchivePath', () => {
  it('prefixa _pending_smb mantendo data e nome', () => {
    const full = buildAtestadoStoragePath({
      basePath: 'Atestados',
      dataReferencia: '2026-08-28',
      colaboradorNome: 'João',
      protocolo: 'AT-2026-ABC123',
      mime: 'image/jpeg',
    });
    expect(buildAtestadoCloudArchivePath(full)).toBe(
      'Atestados/_pending_smb/2026/08/28/joao_AT-2026-ABC123.jpg',
    );
  });
});
