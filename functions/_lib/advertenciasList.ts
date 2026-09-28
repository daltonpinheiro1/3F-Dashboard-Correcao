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

/** Filtros de recorte da listagem (sempre somados ao escopo criado_por_email). */
export type AdvertenciasListFiltros = {
  de: string | null;
  ate: string | null;
  colaborador: string | null;
  nivel: number | null;
  criticos: boolean;
};

export const FILTRO_COLABORADOR_MAX = 80;
export const NIVEL_IDX_MAX = 10;
/** Espelha escalaCritica (src/lib/advertenciasEscala): idx 9 e 10 são críticos. */
export const NIVEL_CRITICO_MIN = 9;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(raw: string): boolean {
  if (!ISO_DAY.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/** Remove caracteres reservados do PostgREST (or/and, curingas). */
export function sanitizeFiltroTexto(raw: string): string {
  return raw.trim().replace(/[*%(),"\\]/g, '').replace(/\s+/g, ' ');
}

export function parseAdvertenciasListFiltros(
  sp: URLSearchParams,
): { ok: true; filtros: AdvertenciasListFiltros } | { ok: false; error: string } {
  const de = (sp.get('de') || '').trim() || null;
  const ate = (sp.get('ate') || '').trim() || null;
  if (de && !isIsoDay(de)) return { ok: false, error: 'Parâmetro de inválido (use AAAA-MM-DD).' };
  if (ate && !isIsoDay(ate)) return { ok: false, error: 'Parâmetro ate inválido (use AAAA-MM-DD).' };
  if (de && ate && de > ate) return { ok: false, error: 'Período inválido: de maior que ate.' };

  const colabRaw = sp.get('colaborador') || '';
  if (colabRaw.length > FILTRO_COLABORADOR_MAX) {
    return { ok: false, error: `Filtro colaborador excede ${FILTRO_COLABORADOR_MAX} caracteres.` };
  }
  const colab = sanitizeFiltroTexto(colabRaw);

  const nivelRaw = (sp.get('nivel') || '').trim();
  let nivel: number | null = null;
  if (nivelRaw) {
    if (!/^\d{1,2}$/.test(nivelRaw) || Number(nivelRaw) > NIVEL_IDX_MAX) {
      return { ok: false, error: 'Parâmetro nivel inválido.' };
    }
    nivel = Number(nivelRaw);
  }
  const crit = (sp.get('criticos') || '').trim().toLowerCase();

  return {
    ok: true,
    filtros: {
      de,
      ate,
      colaborador: colab.length >= 2 ? colab : null,
      nivel,
      criticos: crit === '1' || crit === 'true',
    },
  };
}

export function temFiltrosAdvertencias(f: AdvertenciasListFiltros | null | undefined): boolean {
  return Boolean(f && (f.de || f.ate || f.colaborador || f.nivel != null || f.criticos));
}

/** Campos pesquisados pelo filtro colaborador (mesma regra no Postgres e no fallback). */
export const COLABORADOR_FILTRO_CAMPOS = [
  'colaborador_nome',
  'colaborador_matricula',
  'colaborador_supervisor',
  'observacoes_supervisor',
  'criado_por_nome',
] as const;

/** Fallback Storage: mesma semântica do filtro PostgREST. */
export function filtrarRowsAdvertencias<T extends Record<string, unknown>>(
  rows: T[],
  f: AdvertenciasListFiltros,
): T[] {
  const q = (f.colaborador || '').toLowerCase();
  return rows.filter((r) => {
    const dia = String(r.data_ocorrido || '').slice(0, 10);
    if (f.de && !(dia >= f.de)) return false;
    if (f.ate && !(dia && dia <= f.ate)) return false;
    const idx = Number(r.nivel_idx);
    if (f.criticos) {
      if (!(idx >= NIVEL_CRITICO_MIN)) return false;
    } else if (f.nivel != null && idx !== f.nivel) {
      return false;
    }
    if (q) {
      const hit = COLABORADOR_FILTRO_CAMPOS.some((c) =>
        String(r[c] || '').toLowerCase().includes(q),
      );
      if (!hit) return false;
    }
    return true;
  });
}

/** Query PostgREST para keyset (created_at desc, id desc). */
export function buildPgListPath(opts: {
  limit: number;
  cursor: ListCursor | null;
  status?: string | null;
  /** Escopo supervisor/viewer: só registros criados por este e-mail. */
  criado_por_email?: string | null;
  filtros?: AdvertenciasListFiltros | null;
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
  const f = opts.filtros;
  if (f) {
    const conds: string[] = [];
    if (f.de && isIsoDay(f.de)) conds.push(`data_ocorrido.gte.${f.de}`);
    if (f.ate && isIsoDay(f.ate)) conds.push(`data_ocorrido.lte.${f.ate}`);
    const q = f.colaborador ? sanitizeFiltroTexto(f.colaborador).slice(0, FILTRO_COLABORADOR_MAX) : '';
    if (q.length >= 2) {
      conds.push(`or(${COLABORADOR_FILTRO_CAMPOS.map((c) => `${c}.ilike.*${q}*`).join(',')})`);
    }
    // `or` fica reservado ao cursor; demais condições vão em `and`.
    if (conds.length) params.set('and', `(${conds.join(',')})`);
    if (f.criticos) {
      params.set('nivel_idx', `gte.${NIVEL_CRITICO_MIN}`);
    } else if (f.nivel != null && Number.isInteger(f.nivel) && f.nivel >= 0 && f.nivel <= NIVEL_IDX_MAX) {
      params.set('nivel_idx', `eq.${f.nivel}`);
    }
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
