import type { Atestado } from './atestadosEscala';

/** Arquivo completo ainda não copiado para \\files\ (aguarda sync na rede). */
export function isAtestadoSmbPending(row: Pick<Atestado, 'arquivo_cloud_archive_path' | 'arquivo_smb_synced_at' | 'arquivo_path'>): boolean {
  if (!row.arquivo_path) return false;
  if (row.arquivo_smb_synced_at) return false;
  return Boolean(row.arquivo_cloud_archive_path);
}

/** Completo nos dois ambientes (pasta de rede + archive na nuvem). */
export function isAtestadoDualStored(row: Pick<Atestado, 'arquivo_cloud_archive_path' | 'arquivo_smb_synced_at' | 'arquivo_path'>): boolean {
  return Boolean(row.arquivo_path && row.arquivo_smb_synced_at && row.arquivo_cloud_archive_path);
}

export function atestadoSmbStatusLabel(row: Pick<Atestado, 'arquivo_cloud_archive_path' | 'arquivo_smb_synced_at' | 'arquivo_path'>): string {
  if (!row.arquivo_path) return '';
  if (isAtestadoSmbPending(row)) {
    return 'Nuvem — aguardando pasta de rede';
  }
  if (isAtestadoDualStored(row)) {
    return 'Rede + nuvem (arquivo completo)';
  }
  if (row.arquivo_smb_synced_at) {
    return 'Rede (arquivo) + nuvem (miniatura)';
  }
  return 'Nuvem';
}

export function protocoloSuccessMessage(a: Atestado): string {
  const base = `Atestado ${a.protocolo} protocolado.`;
  if (isAtestadoSmbPending(a)) {
    return `${base} Salvo na nuvem — a pasta de rede recebe cópia no próximo sync (Mac/servidor 3F).`;
  }
  if (isAtestadoDualStored(a) || a.arquivo_smb_synced_at) {
    return `${base} Arquivo na pasta de rede e na nuvem.`;
  }
  return `${base} Salvo na nuvem.`;
}
