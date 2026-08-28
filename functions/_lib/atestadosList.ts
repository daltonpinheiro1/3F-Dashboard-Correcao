/** Listagem paginada de atestados (keyset). */

import {
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  type ListCursor,
} from './advertenciasList';

export { clampListLimit, decodeListCursor, encodeListCursor, type ListCursor };

const TABLE = 'atestados';

export function buildAtestadosPgListPath(opts: {
  limit: number;
  cursor: ListCursor | null;
  status?: string | null;
  ano?: string | null;
  colaborador?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc,id.desc');
  params.set('limit', String(opts.limit + 1));
  if (opts.status) params.set('status', `eq.${opts.status}`);
  if (opts.ano && /^\d{4}$/.test(opts.ano)) {
    params.set('and', `(data_inicio.gte.${opts.ano}-01-01,data_inicio.lte.${opts.ano}-12-31)`);
  }
  if (opts.colaborador) {
    const q = opts.colaborador.trim();
    if (q.length >= 2) {
      params.set('colaborador_nome', `ilike.*${q.replace(/[*%]/g, '')}*`);
    }
  }
  if (opts.cursor) {
    const c = opts.cursor.created_at.replace(/"/g, '');
    const i = opts.cursor.id.replace(/"/g, '');
    params.set('or', `(created_at.lt."${c}",and(created_at.eq."${c}",id.lt."${i}"))`);
  }
  return `/rest/v1/${TABLE}?${params.toString()}`;
}
