import {
  ATESTADO_THUMB_SUFFIX,
} from './atestadosImageConstants';

/** Caminho de arquivamento: {base}/{YYYY}/{MM}/{DD}/{nome_colaborador}_{protocolo}.{ext} */

export const ATESTADOS_BUCKET = 'atestados-docs';
/** Ambiente de testes local — sobrescreva com ATESTADOS_STORAGE_BASE no Pages. */
export const ATESTADOS_STORAGE_BASE_DEFAULT = 'Atestados';

export function resolveStorageBase(envBase?: string): string {
  const raw = String(envBase || ATESTADOS_STORAGE_BASE_DEFAULT).trim();
  return raw.replace(/^\/+|\/+$/g, '') || ATESTADOS_STORAGE_BASE_DEFAULT;
}

/** Slug seguro para nome de arquivo (sem acentos, espaços → _). */
export function slugifyColaborador(nome: string): string {
  return String(nome || 'colaborador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'colaborador';
}

export function extFromMime(mime: string): string {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'bin';
}

export function buildAtestadoStoragePath(opts: {
  basePath: string;
  dataReferencia: string;
  colaboradorNome: string;
  protocolo: string;
  mime: string;
}): string {
  const ref = String(opts.dataReferencia || '').slice(0, 10);
  const parts = ref.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const y = parts?.[1] || String(now.getUTCFullYear());
  const mo = parts?.[2] || String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = parts?.[3] || String(now.getUTCDate()).padStart(2, '0');
  const slug = slugifyColaborador(opts.colaboradorNome);
  const proto = String(opts.protocolo || 'sem-protocolo')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32);
  const ext = extFromMime(opts.mime);
  const base = resolveStorageBase(opts.basePath);
  return `${base}/${y}/${mo}/${d}/${slug}_${proto}.${ext}`;
}

/** Caminho do thumbnail no Supabase (`..._thumb.jpg`). */
export function buildAtestadoThumbStoragePath(arquivoPath: string): string {
  const p = String(arquivoPath || '').trim();
  if (!p) return '';
  if (p.includes(ATESTADO_THUMB_SUFFIX + '.')) return p;
  return p.replace(/\.(jpe?g|png|webp|gif|pdf|bin)$/i, `${ATESTADO_THUMB_SUFFIX}.jpg`);
}

export function isAtestadoThumbPath(path: string): boolean {
  return String(path || '').includes(`${ATESTADO_THUMB_SUFFIX}.`);
}

/** Cópia temporária na nuvem enquanto SMB não recebe o arquivo completo. */
export function buildAtestadoCloudArchivePath(arquivoPath: string): string {
  const p = String(arquivoPath || '').trim().replace(/^\/+/, '');
  if (!p) return '';
  if (p.includes('/_pending_smb/')) return p;
  const base = resolveStorageBase('');
  const rel = p.toLowerCase().startsWith(`${base.toLowerCase()}/`)
    ? p.slice(base.length + 1)
    : p;
  return `${base}/_pending_smb/${rel}`;
}

export function isAtestadoCloudArchivePath(path: string): boolean {
  return String(path || '').includes('/_pending_smb/');
}

export function gerarProtocoloAtestado(now = new Date()): string {
  const y = now.getUTCFullYear();
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `AT-${y}-${hex}`;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function decodeImageBase64(
  raw: string,
): { ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string } {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'Imagem ausente.' };
  let mime = 'image/jpeg';
  let b64 = s;
  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime) && mime !== 'application/pdf') {
    return { ok: false, error: 'Formato não suportado (use JPG, PNG, WEBP ou PDF).' };
  }
  try {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Arquivo grande demais (máx. ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` };
    }
    if (bytes.length < 64) return { ok: false, error: 'Arquivo inválido ou corrompido.' };
    return { ok: true, bytes, mime };
  } catch {
    return { ok: false, error: 'Base64 inválido.' };
  }
}
