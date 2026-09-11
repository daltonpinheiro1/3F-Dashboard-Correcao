/** Caminho de arquivamento — espelho do server (preview no client). */

/** Espelho do server — produção: \\files\03 Operação\Atestados */
export const ATESTADOS_STORAGE_BASE_DEFAULT = 'Atestados';
export const ATESTADOS_SMB_UNC_HINT = '\\\\files\\03 Operação\\Atestados';

export function slugifyColaborador(nome: string): string {
  return String(nome || 'colaborador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'colaborador';
}

export function previewStoragePath(opts: {
  dataReferencia: string;
  colaboradorNome: string;
  protocolo?: string;
  ext?: string;
}): string {
  const ref = String(opts.dataReferencia || '').slice(0, 10);
  const parts = ref.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const y = parts?.[1] || String(now.getFullYear());
  const mo = parts?.[2] || String(now.getMonth() + 1).padStart(2, '0');
  const d = parts?.[3] || String(now.getDate()).padStart(2, '0');
  const slug = slugifyColaborador(opts.colaboradorNome);
  const proto = (opts.protocolo || 'AT-XXXX-XXXXXX').replace(/[^a-zA-Z0-9_-]/g, '');
  const ext = opts.ext === 'pdf' ? 'pdf' : 'jpg';
  return `${ATESTADOS_SMB_UNC_HINT}\\${y}\\${mo}\\${d}\\${slug}_${proto}.${ext}`;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_EXT = /^(jpe?g|png|webp|gif|heic|heif|hif|avif|bmp)$/;
const IMAGE_MIME =
  /^image\/(jpeg|jpg|pjpeg|png|webp|gif|heic|heif|heic-sequence|heif-sequence|avif|bmp)$/i;

export function sniffAtestadoMagic(bytes: Uint8Array): 'pdf' | 'image' | 'unknown' {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image';
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image';
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === 'RIFF' && webp === 'WEBP') return 'image';
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftyp === 'ftyp') {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (['heic', 'heif', 'mif1', 'msf1', 'avif', 'avis', 'heix', 'hevc'].includes(brand)) return 'image';
    }
  }
  return 'unknown';
}

export function atestadoFileKind(file: Pick<File, 'name' | 'type'>): 'pdf' | 'image' | 'unknown' {
  const mime = String(file.type || '').toLowerCase().split(';')[0].trim();
  const ext = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (IMAGE_MIME.test(mime) || IMAGE_EXT.test(ext)) return 'image';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  return 'unknown';
}

/** Magic bytes vencem extensão/MIME (JPEG salvo como .pdf ou câmera sem tipo). */
export function resolveAtestadoKind(
  file: Pick<File, 'name' | 'type'>,
  magic: 'pdf' | 'image' | 'unknown' = 'unknown',
): 'pdf' | 'image' | 'unknown' {
  if (magic === 'pdf' || magic === 'image') return magic;
  return atestadoFileKind(file);
}

export function validateAtestadoFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!file || file.size <= 0) {
    return { ok: false, error: 'Arquivo vazio. Tire a foto de novo pelo botão da câmera.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `Arquivo grande demais (máx. ${MAX_BYTES / 1024 / 1024} MB).` };
  }
  if (atestadoFileKind(file) === 'unknown') {
    return {
      ok: false,
      error: 'Formato não reconhecido. Use a câmera do app ou envie JPG, PNG, WEBP, HEIC ou PDF.',
    };
  }
  return { ok: true };
}
