import { describe, expect, it } from 'vitest';
import { isAtestadoDualStored, isAtestadoSmbPending, protocoloSuccessMessage } from '../../src/lib/atestadosSmbStatus';

describe('atestadosSmbStatus', () => {
  it('detecta pendente de rede', () => {
    expect(
      isAtestadoSmbPending({
        arquivo_path: 'Atestados/2026/08/28/a.jpg',
        arquivo_cloud_archive_path: 'Atestados/_pending_smb/2026/08/28/a.jpg',
        arquivo_smb_synced_at: null,
      }),
    ).toBe(true);
  });

  it('mensagem de sucesso quando só nuvem', () => {
    const msg = protocoloSuccessMessage({
      id: '1',
      protocolo: 'AT-2026-ABC',
      created_at: '',
      updated_at: '',
      colaborador_nome: 'João',
      tipo: 'medico',
      unidade_periodo: 'dias',
      status: 'protocolado',
      arquivo_path: 'Atestados/x.jpg',
      arquivo_cloud_archive_path: 'Atestados/_pending_smb/x.jpg',
      arquivo_smb_synced_at: null,
    });
    expect(msg).toContain('nuvem');
  });

  it('dual-write: rede + nuvem quando synced com archive', () => {
    expect(
      isAtestadoDualStored({
        arquivo_path: 'Atestados/x.jpg',
        arquivo_cloud_archive_path: 'Atestados/_pending_smb/x.jpg',
        arquivo_smb_synced_at: '2026-09-11T14:00:00Z',
      }),
    ).toBe(true);
    expect(
      isAtestadoSmbPending({
        arquivo_path: 'Atestados/x.jpg',
        arquivo_cloud_archive_path: 'Atestados/_pending_smb/x.jpg',
        arquivo_smb_synced_at: '2026-09-11T14:00:00Z',
      }),
    ).toBe(false);
  });
});
