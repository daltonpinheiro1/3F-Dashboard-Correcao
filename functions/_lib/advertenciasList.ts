/** Listagem paginada (keyset) — ordem created_at DESC, id DESC. */

export const LIST_DEFAULT_LIMIT = 200;
export const LIST_MAX_LIMIT = 500;

export const ADVERTENCIA_STATUS_ALLOW = new Set([
  'pendente',
  'aprovada',
  'recusada',
  'executada',
  'cancelada',
]);

/** Sanitiza status para PostgREST (anti filter injection). */
export function sanitizeAdvertenciaStatus(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  return ADVERTENCIA_STATUS_ALLOW.has(s) ? s : null;
}

export type ListCursor = { created_at: string; id: string };

export function encodeListCursor(c: ListCursor): string {
  return btoa(`${c.created_at}\n${c.id}`);
}

const CURSOR_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.+-Z]+$/;
const CURSOR_ID = /^[A-Za-z0-9._-]{1,80}$/;

export function isSafeListCursor(c: ListCursor): boolean {
  if (!CURSOR_ISO.test(c.created_at) || !CURSOR_ID.test(c.id)) return false;
  if (/[",()=]/.test(c.created_at) || /[",()=]/.test(c.id)) return false;
  return true;
}

export function decodeListCursor(raw: string | null | undefined): ListCursor | null {
  if (!raw) return null;
  try {
    const text = atob(raw);
    const nl = text.indexOf('\n');
    if (nl <= 0) return null;
    const created_at = text.slice(0, nl).trim();
    const id = text.slice(nl + 1).trim();
    if (!created_at || !id) return null;
    const c = { created_at, id };
    return isSafeListCursor(c) ? c : null;
  } catch {
    return null;
  }
}

export function clampListLimit(raw: string | null): number {
  const n = Number(raw || LIST_DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n <= 0) return LIST_DEFAULT_LIMIT;
  return Math.min(LIST_MAX_LIMIT, Math.floor(n));
}

/** Keyset: (created_at, id) < cursor no sentido DESC. */
export function isBeforeCursor(
  row: { created_at?: unknown; id?: unknown },
  cursor: ListCursor,
): boolean {
  const ca = String(row.created_at || '');
  const id = String(row.id || '');
  if (ca < cursor.created_at) return true;
  if (ca > cursor.created_at) return false;
  return id < cursor.id;
}

export function paginateRows<T extends { created_at?: unknown; id?: unknown }>(
  sortedDesc: T[],
  cursor: ListCursor | null,
  limit: number,
): { rows: T[]; next_cursor: string | null; has_more: boolean } {
  let start = 0;
  if (cursor) {
    start = sortedDesc.findIndex((r) => isBeforeCursor(r, cursor));
    if (start < 0) start = sortedDesc.length;
  }
  const slice = sortedDesc.slice(start, start + limit + 1);
  const has_more = slice.length > limit;
  const rows = has_more ? slice.slice(0, limit) : slice;
  const last = rows[rows.length - 1];
  const next_cursor =
    has_more && last
      ? encodeListCursor({ created_at: String(last.created_at || ''), id: String(last.id || '') })
      : null;
  return { rows, next_cursor, has_more };
}

/** Query PostgREST para keyset (created_at desc, id desc). */
export function buildPgListPath(opts: {
  limit: number;
  cursor: ListCursor | null;
  status?: string | null;
  /** Escopo supervisor/viewer: só registros criados por este e-mail. */
  criado_por_email?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc,id.desc');
  params.set('limit', String(opts.limit + 1)); // +1 para has_more
  if (opts.status) {
    const st = sanitizeAdvertenciaStatus(opts.status);
    if (st) params.set('status', `eq.${st}`);
  }
  const owner = (opts.criado_por_email || '').trim().toLowerCase().replace(/[",]/g, '');
  if (owner) {
    params.set('criado_por_email', `eq.${owner}`);
  }
  if (opts.cursor) {
    const c = opts.cursor.created_at.replace(/"/g, '');
    const i = opts.cursor.id.replace(/"/g, '');
    // created_at < c OR (created_at = c AND id < i)
    params.set(
      'or',
      `(created_at.lt."${c}",and(created_at.eq."${c}",id.lt."${i}"))`,
    );
  }
  return `/rest/v1/advertencias?${params.toString()}`;
}
