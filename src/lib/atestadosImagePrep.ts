/**
 * Otimização no browser antes do upload:
 * - Arquivo completo: máx. 1600px, JPEG 80% → SMB
 * - Thumbnail: máx. 960px, JPEG 88% → Supabase Storage
 * - PNG/WEBP → JPEG automaticamente
 */

import {
  ATESTADO_ARCHIVE_JPEG_QUALITY,
  ATESTADO_ARCHIVE_MAX_PX,
  ATESTADO_THUMB_JPEG_QUALITY,
  ATESTADO_THUMB_MAX_PX,
} from './atestadosImageConstants';

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

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

function renderJpegDataUrl(
  img: HTMLImageElement,
  maxPx: number,
  quality: number,
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

/** Prepara imagem (resize + JPEG) ou repassa PDF sem thumbnail. */
export async function prepareAtestadoUpload(file: File): Promise<PreparedAtestadoUpload> {
  const originalBytes = file.size;

  if (file.type === 'application/pdf') {
    const fullBase64 = await fileToDataUrl(file);
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

  const img = await loadImageFromFile(file);
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
}
