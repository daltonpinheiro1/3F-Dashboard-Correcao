import { parseTextoAtestado } from './atestadosOcrParse';
import type { IaAnalise } from './atestadosEscala';

/** OCR offline via Tesseract.js (fallback quando IA indisponível). */
export async function analisarAtestadoOcrLocal(file: File): Promise<IaAnalise> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('por', 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(file);
    const parsed = parseTextoAtestado(data.text || '');
    return parsed as IaAnalise;
  } finally {
    await worker.terminate();
  }
}
