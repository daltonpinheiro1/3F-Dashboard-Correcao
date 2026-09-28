/** Listagem paginada de atestados (keyset). */

import {
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  type ListCursor,
} from './advertenciasList';

export { clampListLimit, decodeListCursor, encodeListCursor, type ListCursor };

const TABLE = 'atestados';

export const ATESTADO_STATUS_ALLOW = new Set([
  'protocolado',
  'em_analise',
  'aprovado',
  'recusado',
  'arquivado',
]);

export function sanitizeAtestadoStatus(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  return ATESTADO_STATUS_ALLOW.has(s) ? s : null;
}

export type AtestadosRecorteOpts = {
  status?: string | null;
  ano?: string | null;
  colaborador?: string | null;
  criado_por_email?: string | null;
};

export const ATESTADO_COLABORADOR_MAX = 80;

/** Validação comum de lista e totais; null = ok. */
export function validarAtestadosFiltros(
  sp: URLSearchParams,
  admin: boolean,
): string | null {
  const colaborador = sp.get('colaborador') || '';
  if (colaborador.length > ATESTADO_COLABORADOR_MAX) {
    return `Filtro colaborador excede ${ATESTADO_COLABORADOR_MAX} caracteres.`;
  }
  if (!admin && colaborador && colaborador.trim().length < 2) {
    return 'Filtro colaborador deve ter ao menos 2 caracteres.';
  }
  const ano = (sp.get('ano') || '').trim();
  if (ano && !/^\d{4}$/.test(ano)) return 'Parâmetro ano inválido (use AAAA).';
  return null;
}

function applyAtestadosRecorte(params: URLSearchParams, opts: AtestadosRecorteOpts) {
  if (opts.criado_por_email) {
    const owner = opts.criado_por_email.trim().toLowerCase().replace(/[",]/g, '');
    if (owner) params.set('criado_por_email', `eq.${owner}`);
  }
  const st = sanitizeAtestadoStatus(opts.status);
  if (st) params.set('status', `eq.${st}`);
  if (opts.ano && /^\d{4}$/.test(opts.ano)) {
    params.set('and', `(data_inicio.gte.${opts.ano}-01-01,data_inicio.lte.${opts.ano}-12-31)`);
  }
  if (opts.colaborador) {
    const q = opts.colaborador.trim().replace(/[*%(),]/g, '');
    if (q.length >= 2) {
      params.set('colaborador_nome', `ilike.*${q}*`);
    }
  }
}

export function buildAtestadosPgListPath(opts: AtestadosRecorteOpts & {
  limit: number;
  cursor: ListCursor | null;
}): string {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc,id.desc');
  params.set('limit', String(opts.limit + 1));
  applyAtestadosRecorte(params, opts);
  if (opts.cursor) {
    const c = opts.cursor.created_at.replace(/"/g, '');
    const i = opts.cursor.id.replace(/"/g, '');
    params.set('or', `(created_at.lt."${c}",and(created_at.eq."${c}",id.lt."${i}"))`);
  }
  return `/rest/v1/${TABLE}?${params.toString()}`;
}

export type AtestadoStatusKey = 'protocolado' | 'em_analise' | 'aprovado' | 'recusado' | 'arquivado';
export type AtestadosTotais = Record<AtestadoStatusKey, number> & { total: number };

/**
 * Uma consulta de contagem por status do recorte (usar com Prefer: count=exact).
 * Status filtrado diferente do alvo não gera consulta (total 0).
 */
export function buildAtestadosPgCountPaths(opts: AtestadosRecorteOpts): Partial<Record<AtestadoStatusKey, string>> {
  const filtro = sanitizeAtestadoStatus(opts.status);
  const out: Partial<Record<AtestadoStatusKey, string>> = {};
  for (const s of ATESTADO_STATUS_ALLOW) {
    if (filtro && filtro !== s) continue;
    const params = new URLSearchParams();
    params.set('select', 'id');
    params.set('limit', '1');
    applyAtestadosRecorte(params, { ...opts, status: s });
    out[s as AtestadoStatusKey] = `/rest/v1/${TABLE}?${params.toString()}`;
  }
  return out;
}

/** Total do header content-range do PostgREST (ex.: "0-0/42"). */
export function countFromContentRange(header: string | null | undefined): number | null {
  const m = String(header || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function somarAtestadosTotais(
  counts: Partial<Record<AtestadoStatusKey, number>>,
): AtestadosTotais {
  const t: AtestadosTotais = {
    total: 0,
    protocolado: counts.protocolado || 0,
    em_analise: counts.em_analise || 0,
    aprovado: counts.aprovado || 0,
    recusado: counts.recusado || 0,
    arquivado: counts.arquivado || 0,
  };
  t.total = t.protocolado + t.em_analise + t.aprovado + t.recusado + t.arquivado;
  return t;
}

/** Menor/maior data_inicio visível no escopo (para lista de anos do gerencial). */
export function buildAtestadosPgAnoExtremoPath(
  ordem: 'asc' | 'desc',
  criado_por_email?: string | null,
): string {
  const params = new URLSearchParams();
  params.set('select', 'data_inicio');
  params.set('data_inicio', 'not.is.null');
  params.set('order', `data_inicio.${ordem}`);
  params.set('limit', '1');
  applyAtestadosRecorte(params, { criado_por_email });
  return `/rest/v1/${TABLE}?${params.toString()}`;
}

export const ATESTADOS_ANOS_MAX = 30;

/** Anos do mais recente ao mais antigo, sempre incluindo o ano corrente; limitado a 30. */
export function anosEntre(minIso: string | null, maxIso: string | null, anoAtual: number): number[] {
  const ano = (iso: string | null) => {
    const y = Number(String(iso || '').slice(0, 4));
    return Number.isInteger(y) && y >= 1900 && y <= 2999 ? y : null;
  };
  const min = ano(minIso) ?? anoAtual;
  const max = Math.max(ano(maxIso) ?? anoAtual, anoAtual);
  const out: number[] = [];
  for (let y = max; y >= Math.min(min, max) && out.length < ATESTADOS_ANOS_MAX; y--) out.push(y);
  return out;
}
