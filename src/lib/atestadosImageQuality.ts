/** Análise heurística de qualidade da foto (captura guiada). */

export type ImageQualityReport = {
  score: number;
  ok: boolean;
  issues: string[];
  brightness: number;
  sharpness: number;
  minDimension: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem inválida'));
    };
    img.src = url;
  });
}

/** Variância do Laplaciano (proxy de nitidez) em canvas reduzido. */
function laplacianVariance(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -gray[i - w] - gray[i - 1] + 4 * gray[i] - gray[i + 1] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export async function analyzeImageQuality(file: File): Promise<ImageQualityReport> {
  if (file.type === 'application/pdf') {
    return { score: 100, ok: true, issues: [], brightness: 128, sharpness: 999, minDimension: 0 };
  }
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const minDimension = Math.min(w, h);
  const sample = 320;
  const scale = Math.min(1, sample / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { score: 50, ok: true, issues: [], brightness: 128, sharpness: 100, minDimension };
  }
  ctx.drawImage(img, 0, 0, cw, ch);
  const { data } = ctx.getImageData(0, 0, cw, ch);
  let brightSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightSum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  const brightness = brightSum / (data.length / 4);
  const sharpness = laplacianVariance(ctx, cw, ch);

  const issues: string[] = [];
  if (minDimension < 800) issues.push('Resolução baixa — aproxime a câmera ou use scanner.');
  if (brightness < 70) issues.push('Foto escura — melhore a iluminação.');
  if (brightness > 220) issues.push('Foto estourada — evite flash direto.');
  if (sharpness < 35) issues.push('Imagem borrada — mantenha o celular firme e focado.');
  if (w / h > 2.2 || h / w > 2.2) issues.push('Enquadre o documento inteiro na moldura.');

  let score = 100;
  if (minDimension < 800) score -= 25;
  if (brightness < 70 || brightness > 220) score -= 20;
  if (sharpness < 35) score -= 30;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    ok: score >= 55 && issues.length <= 1,
    issues,
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness),
    minDimension,
  };
}
