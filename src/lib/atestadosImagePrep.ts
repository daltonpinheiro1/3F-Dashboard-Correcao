/**
 * Otimização no browser antes do upload:
 * - Arquivo completo: máx. 1600px, JPEG 80% → SMB
 * - Thumbnail: máx. 960px, JPEG 88% → Supabase Storage
 * - PNG/WEBP/HEIC/AVIF → JPEG (createImageBitmap no Android/Pixel)
 */

import {
  ATESTADO_ARCHIVE_JPEG_QUALITY,
  ATESTADO_ARCHIVE_MAX_PX,
  ATESTADO_THUMB_JPEG_QUALITY,
  ATESTADO_THUMB_MAX_PX,
} from './atestadosImageConstants';
import { resolveAtestadoKind, sniffAtestadoMagic } from './atestadosStorage';

export type PreparedAtestadoUpload = {
  fullBase64: string;
  thumbBase64: string | null;
  mime: string;
  isPdf: boolean;
  previewUrl: string;
  stats: {
    originalBytes: number;
    fullBytes: number;
    thumbBytes: number | null;
  };
};

const DECODE_FAIL =
  'Não foi possível ler a foto. No celular, use «Tirar foto» ou envie um JPG da galeria (HEIC às vezes falha no navegador).';

function loadHtmlImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(DECODE_FAIL));
    };
    img.src = url;
  });
}

/** HEIC/AVIF da câmera Pixel: `Image()` falha; `createImageBitmap` costuma funcionar no Chromium. */
export async function decodeAtestadoImage(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* tenta HTMLImage */
    }
  }
  const img = await loadHtmlImageFromFile(file);
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(img);
  }
  throw new Error(DECODE_FAIL);
}

function renderJpegDataUrl(
  img: CanvasImageSource & { width: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  maxPx: number,
  quality: number,
): string {
  const w = Number(img.naturalWidth || img.width || 0);
  const h = Number(img.naturalHeight || img.height || 0);
  if (!w || !h) throw new Error('Dimensões da imagem inválidas.');
  const scale = Math.min(1, maxPx / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não disponível neste navegador.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas.toDataURL('image/jpeg', quality);
}

function dataUrlByteLength(dataUrl: string): number {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/i);
  if (!m) return dataUrl.length;
  const pad = m[1].endsWith('==') ? 2 : m[1].endsWith('=') ? 1 : 0;
  return Math.floor((m[1].length * 3) / 4) - pad;
}

async function fileToDataUrl(file: File, forcedMime?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      resolve(forcedMime ? raw.replace(/^data:[^;]*;/i, `data:${forcedMime};`) : raw);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

/** Prepara imagem (resize + JPEG) ou repassa PDF sem thumbnail. */
export async function prepareAtestadoUpload(file: File): Promise<PreparedAtestadoUpload> {
  const originalBytes = file.size;

  const magic = sniffAtestadoMagic(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  if (resolveAtestadoKind(file, magic) === 'pdf') {
    const fullBase64 = await fileToDataUrl(file, 'application/pdf');
    const previewUrl = URL.createObjectURL(file);
    return {
      fullBase64,
      thumbBase64: null,
      mime: 'application/pdf',
      isPdf: true,
      previewUrl,
      stats: { originalBytes, fullBytes: originalBytes, thumbBytes: null },
    };
  }

  const img = await decodeAtestadoImage(file);
  try {
    const fullBase64 = renderJpegDataUrl(img, ATESTADO_ARCHIVE_MAX_PX, ATESTADO_ARCHIVE_JPEG_QUALITY);
    const thumbBase64 = renderJpegDataUrl(img, ATESTADO_THUMB_MAX_PX, ATESTADO_THUMB_JPEG_QUALITY);
    const previewUrl = fullBase64;

    return {
      fullBase64,
      thumbBase64,
      mime: 'image/jpeg',
      isPdf: false,
      previewUrl,
      stats: {
        originalBytes,
        fullBytes: dataUrlByteLength(fullBase64),
        thumbBytes: dataUrlByteLength(thumbBase64),
      },
    };
  } finally {
    img.close();
  }
}
