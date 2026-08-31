import type { Atestado } from './atestadosEscala';

/** Arquivo completo ainda não copiado para \\files\ (aguarda sync na rede). */
export function isAtestadoSmbPending(row: Pick<Atestado, 'arquivo_cloud_archive_path' | 'arquivo_smb_synced_at' | 'arquivo_path'>): boolean {
  if (!row.arquivo_path) return false;
  if (row.arquivo_smb_synced_at) return false;
  return Boolean(row.arquivo_cloud_archive_path);
}

export function atestadoSmbStatusLabel(row: Pick<Atestado, 'arquivo_cloud_archive_path' | 'arquivo_smb_synced_at' | 'arquivo_path'>): string {
  if (!row.arquivo_path) return '';
  if (isAtestadoSmbPending(row)) {
    return 'Nuvem — aguardando pasta de rede';
  }
  if (row.arquivo_smb_synced_at) {
    return 'Rede (arquivo) + nuvem (miniatura)';
  }
  return 'Nuvem';
}

export function protocoloSuccessMessage(a: Atestado): string {
  const base = `Atestado ${a.protocolo} protocolado.`;
  if (isAtestadoSmbPending(a)) {
    return `${base} Salvo na nuvem — será copiado para a pasta de rede quando um Mac/servidor na rede 3F sincronizar.`;
  }
  if (a.arquivo_smb_synced_at) {
    return `${base} Arquivo na rede e miniatura na nuvem.`;
  }
  return base;
}
