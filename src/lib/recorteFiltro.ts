import type { CuboFilter } from './cuboQuery';

/** Recorte vindo da URL (?supervisor=&equipe=). Valores exatos, como gravados no cubo. */
export type Recorte = { supervisor: string; equipe: string };

/** Rótulos que o agregador usa quando o campo vem vazio no cubo. */
const SEM_SUPERVISOR = new Set(['Sem supervisor', 'Não identificado']);
const SEM_EQUIPE = '-';

export function lerRecorte(params: URLSearchParams): Recorte {
  return {
    supervisor: (params.get('supervisor') || '').trim(),
    equipe: (params.get('equipe') || '').trim(),
  };
}

export function recorteAtivo(recorte: Recorte): boolean {
  return Boolean(recorte.supervisor || recorte.equipe);
}

export function rotuloRecorte(recorte: Recorte): string {
  return [recorte.supervisor, recorte.equipe].filter(Boolean).join(' · ');
}

export function chaveRecorte(recorte: Recorte): string {
  return `${recorte.supervisor}|${recorte.equipe}`;
}

export function noRecorte(
  row: { supervisor?: string | null; equipe?: string | null },
  recorte: Recorte,
): boolean {
  if (recorte.supervisor) {
    const sup = (row.supervisor || '').trim();
    const ok = SEM_SUPERVISOR.has(recorte.supervisor) ? !sup || sup === recorte.supervisor : sup === recorte.supervisor;
    if (!ok) return false;
  }
  if (recorte.equipe) {
    const eq = (row.equipe || '').trim();
    const ok = recorte.equipe === SEM_EQUIPE ? !eq || eq === SEM_EQUIPE : eq === recorte.equipe;
    if (!ok) return false;
  }
  return true;
}

/**
 * Filtros `eq` para o cubo-query. Rótulos de vazio não têm `is.null` no cubo:
 * ficam de fora do servidor e o cliente completa com `noRecorte`.
 */
export function filtrosRecorteCubo(recorte: Recorte): CuboFilter[] {
  const out: CuboFilter[] = [];
  if (recorte.supervisor && !SEM_SUPERVISOR.has(recorte.supervisor)) {
    out.push({ column: 'supervisor', op: 'eq', value: recorte.supervisor });
  }
  if (recorte.equipe && recorte.equipe !== SEM_EQUIPE) {
    out.push({ column: 'equipe', op: 'eq', value: recorte.equipe });
  }
  return out;
}

export function limparRecorteParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('supervisor');
  next.delete('equipe');
  return next;
}
