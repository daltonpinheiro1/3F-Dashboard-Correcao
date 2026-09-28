/**
 * Decision matrix — GET /api/portabilidade-matrix?dias=7[&ate=YYYY-MM-DD]
 *
 * Fontes estáveis (schema real do bot):
 * - retornos_reprocessamento: operacao, adjustments, processed_at
 * - fila_acoes_portabilidade: acao, retorno_motivo, resultado_mensagem
 *
 * Colunas opcionais (acao_decidida / matrix_version) NÃO entram no select:
 * PostgREST 400 nessas colunas derrubava o painel.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { hintFromRows, montarMatrixPayload } from '../_lib/portabilidadeMatrix';
import { dataBrtIsoFn, sinceBrtDaysIso, startOfBrtDayIso } from '../_lib/rrKpis';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth &
  RateLimitEnv & {
    PORTABILIDADE_SUPABASE_URL?: string;
    PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
  };

type Cfg = { url: string; key: string };

function portabConfig(env: Env): Cfg | null {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function sbRows(
  cfg: Cfg,
  table: string,
  params: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const q = new URLSearchParams(params);
  const r = await fetch(`${cfg.url}/rest/v1/${table}?${q}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 180);
    console.error(`[portabilidade-matrix] ${table} HTTP ${r.status}`, detail);
    throw new Error(`${table} indisponível (HTTP ${r.status}).`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function paginar(
  cfg: Cfg,
  table: string,
  params: Record<string, string>,
  teto = 4000,
): Promise<{ rows: Array<Record<string, unknown>>; truncado: boolean }> {
  const out: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < teto; offset += 1000) {
    const batch = await sbRows(cfg, table, {
      ...params,
      // Offset só é estável com ordem única.
      order: params.order ? `${params.order},id.asc` : 'id.asc',
      offset: String(offset),
      limit: '1000',
    });
    if (!batch.length) return { rows: out, truncado: false };
    out.push(...batch);
    if (batch.length < 1000) return { rows: out, truncado: false };
  }
  const probe = await sbRows(cfg, table, {
    ...params,
    offset: String(teto),
    limit: '1',
  });
  return { rows: out, truncado: probe.length > 0 };
}

export async function fetchMatrixHint(
  cfg: Cfg,
): Promise<{ matrix_version: string; matrix_version_tag: string }> {
  const rows = await sbRows(cfg, 'retornos_reprocessamento', {
    select: 'adjustments,processed_at',
    order: 'processed_at.desc',
    limit: '40',
  });
  const hint = hintFromRows(rows);
  if (hint.matrix_version) return hint;
  const fila = await sbRows(cfg, 'fila_acoes_portabilidade', {
    select: 'resultado_mensagem,retorno_motivo,executed_at',
    order: 'executed_at.desc',
    limit: '40',
  });
  return hintFromRows(fila);
}

/** `ate` (YYYY-MM-DD, antes de hoje BRT) fecha a janela no fim daquele dia; senão termina agora. */
export function janelaMatrix(
  diasRaw: string | null,
  ateRaw: string | null,
  agora = new Date(),
): { dias: number; since: string; until: string | null; ate: string | null } {
  const dias = Math.min(30, Math.max(1, Math.floor(Number(diasRaw || '7')) || 7));
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(ateRaw || '') ? String(ateRaw) : '';
  const meioDia = ate ? new Date(`${ate}T12:00:00-03:00`) : null;
  if (!ate || !meioDia || Number.isNaN(meioDia.getTime()) || dataBrtIsoFn(meioDia) !== ate) {
    return { dias, since: sinceBrtDaysIso(dias, agora), until: null, ate: null };
  }
  if (ate >= dataBrtIsoFn(agora)) {
    return { dias, since: sinceBrtDaysIso(dias, agora), until: null, ate: null };
  }
  return {
    dias,
    since: sinceBrtDaysIso(dias, meioDia),
    until: startOfBrtDayIso(new Date(meioDia.getTime() + 86_400_000)),
    ate,
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-matrix', 60_000, 20))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = portabConfig(context.env);
  if (!cfg) {
    return json({ error: 'Secrets portabilidade ausentes no Pages.' }, 503);
  }

  const u = new URL(context.request.url);
  const { dias, since, until, ate } = janelaMatrix(u.searchParams.get('dias'), u.searchParams.get('ate'));
  // Âncora vira filtro na mesma consulta: nenhum subrequest a mais.
  const teto = (col: string): Record<string, string> =>
    until ? { and: `(${col}.lt."${until}")` } : {};

  try {
    const [retornosPage, cancelamentosPage, filaPage] = await Promise.all([
      paginar(cfg, 'retornos_reprocessamento', {
        select: 'operacao,adjustments,processed_at',
        processed_at: `gte.${since}`,
        ...teto('processed_at'),
        order: 'processed_at.desc',
      }),
      paginar(cfg, 'fila_acoes_portabilidade', {
        select: 'retorno_motivo,resultado_mensagem,executed_at',
        acao: 'eq.cancel',
        status: 'eq.concluida',
        executed_at: `gte.${since}`,
        ...teto('executed_at'),
      }),
      paginar(
        cfg,
        'fila_acoes_portabilidade',
        {
          select: 'acao,retorno_motivo,resultado_mensagem,created_at',
          created_at: `gte.${since}`,
          ...teto('created_at'),
          order: 'created_at.desc',
        },
        3000,
      ),
    ]);

    return json({
      janela: { desde: since, ate_exclusivo: until, ate, ancorada: Boolean(until) },
      ...montarMatrixPayload({
        dias,
        retornos: retornosPage.rows,
        cancelamentos: cancelamentosPage.rows,
        fila: filaPage.rows,
        truncados: {
          retornos: retornosPage.truncado,
          cancelamentos: cancelamentosPage.truncado,
          fila: filaPage.truncado,
        },
      }),
    });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return json({ error: `Falha ao montar matrix: ${msg}` }, 502);
  }
}
