import type { Advertencia } from './advertenciasEscala';

const STORAGE_PREFIX = '3f_advertencias_seen_v1';

export type SeenSnapshot = {
  status: string;
  entrega_status?: string | null;
};

function storageKey(userEmail: string): string {
  return `${STORAGE_PREFIX}:${userEmail.trim().toLowerCase()}`;
}

export function loadSeenMap(userEmail: string): Record<string, SeenSnapshot> {
  if (!userEmail) return {};
  try {
    const raw = localStorage.getItem(storageKey(userEmail));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SeenSnapshot>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSeenMap(userEmail: string, map: Record<string, SeenSnapshot>): void {
  if (!userEmail) return;
  try {
    localStorage.setItem(storageKey(userEmail), JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

export function isMinhaSolicitacao(r: Advertencia, userEmail: string): boolean {
  if (!userEmail) return false;
  return (r.criado_por_email || '').trim().toLowerCase() === userEmail.trim().toLowerCase();
}

/** Primeira visita: grava baseline sem alertar. Depois: detecta mudança de status/entrega. */
export function temAtualizacaoNaoVista(
  r: Advertencia,
  userEmail: string,
  seen: Record<string, SeenSnapshot>,
  baselineReady: boolean,
): boolean {
  if (!baselineReady || !isMinhaSolicitacao(r, userEmail)) return false;
  const prev = seen[r.id];
  if (!prev) return false;
  const entrega = r.entrega_status || '';
  const prevEntrega = prev.entrega_status || '';
  return prev.status !== r.status || prevEntrega !== entrega;
}

export function snapshotDe(r: Advertencia): SeenSnapshot {
  return { status: r.status, entrega_status: r.entrega_status || null };
}

/** Grava estado atual das minhas solicitações como baseline (primeira carga). */
export function seedBaseline(userEmail: string, rows: Advertencia[]): Record<string, SeenSnapshot> {
  const map = loadSeenMap(userEmail);
  let changed = false;
  for (const r of rows) {
    if (!isMinhaSolicitacao(r, userEmail)) continue;
    if (!map[r.id]) {
      map[r.id] = snapshotDe(r);
      changed = true;
    }
  }
  if (changed) saveSeenMap(userEmail, map);
  return map;
}

export function marcarComoVista(userEmail: string, r: Advertencia): Record<string, SeenSnapshot> {
  const map = loadSeenMap(userEmail);
  map[r.id] = snapshotDe(r);
  saveSeenMap(userEmail, map);
  return map;
}

export function marcarTodasMinhasComoVistas(
  userEmail: string,
  rows: Advertencia[],
): Record<string, SeenSnapshot> {
  const map = loadSeenMap(userEmail);
  for (const r of rows) {
    if (isMinhaSolicitacao(r, userEmail)) map[r.id] = snapshotDe(r);
  }
  saveSeenMap(userEmail, map);
  return map;
}

export function resumoMinhasSolicitacoes(rows: Advertencia[], userEmail: string) {
  const minhas = rows.filter((r) => isMinhaSolicitacao(r, userEmail));
  const pendentesDp = minhas.filter((r) => r.status === 'pendente').length;
  const aguardandoEntrega = minhas.filter(
    (r) => r.status === 'aprovada' && r.entrega_status !== 'entregue' && r.entrega_status !== 'recusada_ciencia',
  ).length;
  return { total: minhas.length, pendentesDp, aguardandoEntrega };
}

export const NOTIFICACAO_LABEL = {
  desativada: 'E-mail desativado',
  pendente: 'E-mail pendente',
  enviada: 'E-mail enviado',
  falha: 'Falha no e-mail',
} as const;
