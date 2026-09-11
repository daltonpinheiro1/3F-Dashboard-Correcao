import { describe, expect, it, vi } from 'vitest';

vi.mock('./atestadosSmbPush', () => ({
  pushArquivoToSmbBridge: vi.fn(),
}));

import { persistAtestadoArquivos } from './atestadosSmbArchive';
import { pushArquivoToSmbBridge } from './atestadosSmbPush';

describe('persistAtestadoArquivos dual-write', () => {
  it('grava archive na nuvem mesmo quando o SMB bridge responde ok', async () => {
    vi.mocked(pushArquivoToSmbBridge).mockResolvedValue({ ok: true });
    const uploaded: string[] = [];
    const out = await persistAtestadoArquivos({
      env: { ATESTADOS_SMB_BRIDGE_URL: 'https://b/push', ATESTADOS_SMB_BRIDGE_SECRET: 's' },
      arquivo_path: 'Atestados/2026/09/11/livia_AT-2026-0C39A0.jpg',
      bytes: new Uint8Array([1, 2, 3, 4]),
      mime: 'image/jpeg',
      thumbBytes: new Uint8Array([9, 9]),
      uploadArquivo: async (p) => {
        uploaded.push(p);
      },
    });
    expect(uploaded.some((p) => p.includes('_pending_smb/'))).toBe(true);
    expect(uploaded.some((p) => p.includes('_thumb.'))).toBe(true);
    expect(out.arquivo_cloud_archive_path).toContain('_pending_smb/');
    expect(out.arquivo_smb_synced_at).toBeTruthy();
  });

  it('mantém archive na nuvem quando o SMB falha (fila para o sync)', async () => {
    vi.mocked(pushArquivoToSmbBridge).mockResolvedValue({ ok: false, error: 'bridge down' });
    const out = await persistAtestadoArquivos({
      env: {},
      arquivo_path: 'Atestados/2026/09/11/a.jpg',
      bytes: new Uint8Array([1, 2, 3, 4]),
      mime: 'image/jpeg',
      uploadArquivo: async () => {},
    });
    expect(out.arquivo_cloud_archive_path).toContain('_pending_smb/');
    expect(out.arquivo_smb_synced_at).toBeNull();
  });
});
