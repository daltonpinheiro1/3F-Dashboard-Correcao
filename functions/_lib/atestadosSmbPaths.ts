/** Caminhos lógicos (DB/Supabase) ↔ pasta SMB `\\files\03 Operação\Atestados`. */

export const ATESTADOS_SMB_UNC_ROOT = '\\\\files\\03 Operação\\Atestados';
export const ATESTADOS_SMB_SHARE_LABEL = '03 Operação/Atestados';

/** Base lógica gravada no banco e no bucket (produção). */
export const ATESTADOS_STORAGE_PRODUCTION_BASE = 'Atestados';

/** Remove prefixo `Atestados/` para gravar no mount local. */
export function toSmbRelativePath(arquivoPath: string): string {
  const p = String(arquivoPath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  const prefix = `${ATESTADOS_STORAGE_PRODUCTION_BASE}/`;
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) {
    return p.slice(prefix.length);
  }
  if (p.toLowerCase() === ATESTADOS_STORAGE_PRODUCTION_BASE.toLowerCase()) return '';
  return p;
}

/** Caminho relativo dentro do mount `.../Atestados`. */
export function resolveSmbFilesystemPath(smbRoot: string, arquivoPath: string): string {
  const root = String(smbRoot || '').replace(/\/+$/g, '');
  const rel = toSmbRelativePath(arquivoPath);
  if (!rel) return root;
  return `${root}/${rel}`;
}

/** UNC Windows para exibição em e-mail / UI. */
export function toSmbUncPath(arquivoPath: string): string {
  const rel = toSmbRelativePath(arquivoPath).replace(/\//g, '\\');
  if (!rel) return ATESTADOS_SMB_UNC_ROOT;
  return `${ATESTADOS_SMB_UNC_ROOT}\\${rel}`;
}
