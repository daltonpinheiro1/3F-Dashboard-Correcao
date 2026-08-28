/** Caminho de arquivamento — espelho do server (preview no client). */

/** Espelho do server — ambiente de testes até definir destino final. */
export const ATESTADOS_STORAGE_BASE_DEFAULT = 'atestados-local/testes';

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
  const ext = opts.ext || 'jpg';
  return `${ATESTADOS_STORAGE_BASE_DEFAULT}/${y}/${mo}/${d}/${slug}_${proto}.${ext}`;
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

export function validateAtestadoFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `Arquivo grande demais (máx. ${MAX_BYTES / 1024 / 1024} MB).` };
  }
  const ok =
    /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type) || file.type === 'application/pdf';
  if (!ok) return { ok: false, error: 'Use JPG, PNG, WEBP ou PDF.' };
  return { ok: true };
}
