import { dashboardSessionHeaders } from './dashboardSession';
import { requerAprovacaoDp, type Advertencia, type AdvertenciaCreate, type AdvertenciaStatus } from './advertenciasEscala';

let storageMode: 'api' | 'offline' = 'api';

function uid(): string {
  return crypto.randomUUID();
}

export function advertenciasStorageMode(): 'api' | 'offline' {
  return storageMode;
}

export function resetAdvertenciasProbe() {
  /* compat — single-store via API */
}

async function apiFetch(pathQuery: string, init: RequestInit): Promise<Response> {
  const headers = dashboardSessionHeaders(init.headers);
  return fetch(`/api/advertencias${pathQuery}`, { ...init, headers });
}

function throwAdvertenciasApiError(
  status: number,
  data: { error?: string },
  fallback: string,
): never {
  const msg = data.error || fallback;
  // 401/403 = sessão/permissão — API está no ar; não marcar "offline"/migration
  if (status === 401 || status === 403) {
    storageMode = 'api';
    throw new Error(msg.includes('Sessão') || msg.includes('logout') ? msg : `${msg} Faça logout/login.`);
  }
  storageMode = 'offline';
  throw new Error(msg);
}

/** Tamanho padrão de página no Controle DP (carregar mais). */
export const ADVERTENCIAS_PAGE_LIMIT = 100;

export type ListAdvertenciasPage = {
  rows: Advertencia[];
  next_cursor: string | null;
  has_more: boolean;
  limit?: number;
  storage?: string;
};

/** Uma página (keyset). */
export async function listAdvertenciasPage(opts?: {
  cursor?: string | null;
  limit?: number;
  status?: string | null;
  id?: string | null;
}): Promise<ListAdvertenciasPage> {
  const q = new URLSearchParams();
  if (opts?.id) {
    q.set('id', opts.id);
  } else {
    if (opts?.cursor) q.set('cursor', opts.cursor);
    const limit = opts?.limit ?? ADVERTENCIAS_PAGE_LIMIT;
    q.set('limit', String(limit));
    if (opts?.status) q.set('status', opts.status);
  }
  const qs = q.toString() ? `?${q.toString()}` : '';
  const r = await apiFetch(qs, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ListAdvertenciasPage & { error?: string };
  if (!r.ok) {
    throwAdvertenciasApiError(r.status, data, `Falha ao listar advertências (${r.status})`);
  }
  storageMode = 'api';
  return {
    rows: data.rows || [],
    next_cursor: data.next_cursor ?? null,
    has_more: Boolean(data.has_more),
    limit: data.limit,
    storage: data.storage,
  };
}

/** Lookup pontual (deep link) — uma request, sem auto-paginar. */
export async function getAdvertenciaById(id: string): Promise<Advertencia | null> {
  const page = await listAdvertenciasPage({ id });
  return page.rows[0] || null;
}

/**
 * Agrega todas as páginas de um status (ex.: pendente para badge Enviadas).
 * Teto 20 páginas para não estourar rate limit.
 */
export async function listAdvertenciasByStatusAll(
  status: string,
  limitPerPage = ADVERTENCIAS_PAGE_LIMIT,
): Promise<Advertencia[]> {
  const all: Advertencia[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const page = await listAdvertenciasPage({ status, cursor, limit: limitPerPage });
    all.push(...page.rows);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

export function sortAdvertenciasDesc(rows: Advertencia[]): Advertencia[] {
  return [...rows].sort((a, b) => {
    const byDate = (b.created_at || '').localeCompare(a.created_at || '');
    if (byDate !== 0) return byDate;
    return (b.id || '').localeCompare(a.id || '');
  });
}

/**
 * Compat / export: agrega páginas via cursor (até ~10k).
 * Preferir listAdvertenciasPage + carregar mais na UI.
 */
export async function listAdvertencias(): Promise<Advertencia[]> {
  const all: Advertencia[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await listAdvertenciasPage({ cursor, limit: ADVERTENCIAS_PAGE_LIMIT });
    all.push(...page.rows);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return sortAdvertenciasDesc(all);
}

/** Mescla páginas sem duplicar id (preserva ordem de chegada / keyset). */
export function mergeAdvertenciaPages(
  prev: Advertencia[],
  next: Advertencia[],
): Advertencia[] {
  if (!prev.length) return next;
  if (!next.length) return prev;
  const seen = new Set(prev.map((r) => r.id));
  const extra = next.filter((r) => !seen.has(r.id));
  return extra.length ? [...prev, ...extra] : prev;
}

/** Upsert por id (mutações otimistas / deep link). */
export function upsertAdvertenciaRow(rows: Advertencia[], row: Advertencia): Advertencia[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i < 0) return sortAdvertenciasDesc([row, ...rows]);
  const next = [...rows];
  next[i] = row;
  return next;
}

export async function createAdvertencia(input: AdvertenciaCreate): Promise<Advertencia> {
  const now = new Date().toISOString();
  const row: Advertencia = {
    ...input,
    id: uid(),
    created_at: now,
    updated_at: now,
    status: input.status || 'pendente',
    anexos: input.anexos || [],
  };

  const r = await apiFetch('', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
  if (!r.ok) {
    throwAdvertenciasApiError(r.status, data, `Falha ao salvar advertência (${r.status})`);
  }
  storageMode = 'api';
  return (data.row || row) as Advertencia;
}

export async function updateAdvertenciaStatus(
  id: string,
  patch: Partial<Advertencia>,
): Promise<Advertencia | null> {
  const r = await apiFetch('', {
    method: 'PATCH',
    body: JSON.stringify({ id, patch }),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
  if (!r.ok) {
    throwAdvertenciasApiError(r.status, data, `Falha ao atualizar (${r.status})`);
  }
  storageMode = 'api';
  return (data.row || null) as Advertencia | null;
}

export type NotificarResult = {
  ok?: boolean;
  skipped?: boolean;
  error?: string;
  message?: string;
  to?: string;
};

export async function notificarSolicitanteAdvertencia(
  id: string,
  pdfBase64?: string,
  force = false,
): Promise<NotificarResult> {
  const r = await fetch('/api/advertencia-notificar', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify({ id, pdf_base64: pdfBase64, force }),
  });
  const data = (await r.json().catch(() => ({}))) as NotificarResult & { detalhe?: string };
  if (!r.ok && !data.skipped) {
    throw new Error(data.error || data.message || `Falha ao notificar (${r.status})`);
  }
  return data;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error('Falha ao converter PDF'));
    reader.readAsDataURL(blob);
  });
}

/** @deprecated — cliente não grava mais em localStorage (PII). */
export function clearLegacyLocalAdvertencias() {
  try {
    localStorage.removeItem('3f_advertencias_v1');
  } catch {
    /* ignore */
  }
}

export function kpisAdvertencias(rows: Advertencia[]) {
  const agora = new Date();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();
  // Suspensão e apuração jurídica aguardam DP
  const pendentes = rows.filter((r) => r.status === 'pendente' && requerAprovacaoDp(r.nivel_idx)).length;
  const noMes = rows.filter((r) => {
    const d = new Date(r.created_at || r.data_ocorrido);
    return d.getMonth() === mes && d.getFullYear() === ano;
  }).length;
  const hojeIso = agora.toISOString().slice(0, 10);
  const suspensoesAtivas = rows.filter((r) => {
    if (!(r.status === 'aprovada' || r.status === 'executada')) return false;
    const dias = r.dias_suspensao || 0;
    if (dias <= 0) return false;
    const base = r.aprovado_em || r.updated_at || r.created_at || r.data_ocorrido;
    const ini = new Date(base);
    if (Number.isNaN(ini.getTime())) return false;
    const fim = new Date(ini);
    fim.setDate(fim.getDate() + dias);
    return hojeIso <= fim.toISOString().slice(0, 10);
  }).length;
  const criticos = new Set(
    rows
      .filter((r) => (r.status === 'aprovada' || r.status === 'executada') && r.nivel_idx >= 9)
      .map((r) => (r.colaborador_matricula || r.colaborador_nome).trim().toLowerCase()),
  ).size;
  return { pendentes, noMes, suspensoesAtivas, criticos };
}

export function historicoColaborador(
  rows: Advertencia[],
  nome: string,
  matricula?: string,
): Advertencia[] {
  const n = nome.trim().toLowerCase();
  const m = (matricula || '').trim().toLowerCase();
  if (!n && !m) return [];
  return rows
    .filter((r) => {
      if (m && (r.colaborador_matricula || '').trim().toLowerCase() === m) return true;
      if (!n) return false;
      return (r.colaborador_nome || '').trim().toLowerCase() === n;
    })
    .sort((a, b) => (b.data_ocorrido || b.created_at || '').localeCompare(a.data_ocorrido || a.created_at || ''));
}

export function niveisAplicados(hist: Advertencia[]): number[] {
  return hist
    .filter((r) => r.status === 'aprovada' || r.status === 'executada')
    .map((r) => r.nivel_idx);
}

export const STATUS_LABEL: Record<AdvertenciaStatus, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  executada: 'Executada',
  cancelada: 'Cancelada',
};

export const STATUS_CLS: Record<AdvertenciaStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  aprovada: 'bg-emerald-100 text-emerald-800',
  recusada: 'bg-red-100 text-red-700',
  executada: 'bg-blue-100 text-blue-800',
  cancelada: 'bg-gray-100 text-gray-600',
};
