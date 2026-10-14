/**
 * GET /api/atestados-stats — contagens leves para badge sidebar e KPIs.
 */

import {
  authorizeRequest,
  clientIp,
  json,
  requireAlgumaAba,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { agruparAlertasInss, type InssRef } from '../_lib/atestadosInss';

const TABLE = 'atestados';
type Env = EnvAuth & RateLimitEnv;

/** Abas que exibem os contadores (sem PII): badge da aba Atestados e cards da Inteligência. */
export const ABAS_ATESTADOS_STATS = ['atestados', 'inteligencia'] as const;
const CACHE_MS = 60_000;
let cache: { at: number; body: Record<string, unknown> } | null = null;

const INSS_PAGE = 1000;
const INSS_MAX_PAGES = 20;

function anoBrt(now = new Date()): number {
  return new Date(now.getTime() - 3 * 3_600_000).getUTCFullYear();
}

/** Mesmo recorte do gerencial: data_inicio no ano; recusados e horas descartados no agrupamento. */
export function buildInssStatsPath(ano: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('select', 'id,colaborador_matricula,colaborador_nome,cid,data_inicio,data_fim,quantidade_dias,unidade_periodo,status');
  params.set('status', 'neq.recusado');
  params.set('unidade_periodo', 'eq.dias');
  params.set('and', `(data_inicio.gte.${ano}-01-01,data_inicio.lte.${ano}-12-31)`);
  params.set('order', 'data_inicio.asc,id.asc');
  params.set('limit', String(INSS_PAGE));
  params.set('offset', String(offset));
  return `/rest/v1/${TABLE}?${params.toString()}`;
}

async function carregarLinhasInss(env: Env, ano: number): Promise<{ rows: InssRef[]; truncado: boolean }> {
  const rows: InssRef[] = [];
  for (let page = 0; page < INSS_MAX_PAGES; page++) {
    const r = await sbFetch(env, buildInssStatsPath(ano, page * INSS_PAGE));
    if (!r.ok) throw new Error(`Falha ao carregar atestados para INSS: ${r.status}`);
    const data = (await r.json()) as InssRef[];
    rows.push(...data);
    if (data.length < INSS_PAGE) return { rows, truncado: false };
  }
  return { rows, truncado: true };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'atestados-stats'))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAlgumaAba(await authorizeRequest(context.request, context.env), ABAS_ATESTADOS_STATS);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (cache && Date.now() - cache.at < CACHE_MS) return json(cache.body);

  try {
    const ano = anoBrt();
    const [pend, analise, inssRows, smbPending] = await Promise.all([
      sbFetch(
        context.env,
        `/rest/v1/${TABLE}?select=id&status=eq.protocolado&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
      sbFetch(
        context.env,
        `/rest/v1/${TABLE}?select=id&status=eq.em_analise&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
      carregarLinhasInss(context.env, ano),
      sbFetch(
        context.env,
        // Alinha com isAtestadoSmbPending: precisa ter arquivo_path + cloud path, sem sync SMB.
        `/rest/v1/${TABLE}?select=id&arquivo_path=not.is.null&arquivo_cloud_archive_path=not.is.null&arquivo_smb_synced_at=is.null&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
    ]);

    const countFrom = (r: Response) => {
      if (!r.ok) throw new Error(`Falha na contagem de atestados: ${r.status}`);
      const h = r.headers.get('content-range') || '';
      const m = h.match(/\/(\d+)$/);
      if (!m) throw new Error('Contagem de atestados sem content-range.');
      return Number(m[1]);
    };

    const protocolados = countFrom(pend);
    const em_analise = countFrom(analise);
    const inss_alertas = agruparAlertasInss(inssRows.rows).length;
    const smb_pendentes = countFrom(smbPending);

    const body = {
      pendentes: protocolados + em_analise,
      protocolados,
      em_analise,
      inss_alertas,
      inss_ano: ano,
      inss_parcial: inssRows.truncado,
      smb_pendentes,
    };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
