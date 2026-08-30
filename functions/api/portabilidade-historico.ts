/**
 * Histórico gerencial mês a mês — contagens leves (count=exact).
 * GET /api/portabilidade-historico?meses=3
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv & {
  PORTABILIDADE_SUPABASE_URL?: string;
  PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
};

function portabConfig(env: Env) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function mesAtualBrt(agora = new Date()): { y: number; m: number } {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return { y: sp.getUTCFullYear(), m: sp.getUTCMonth() + 1 };
}

function mesBounds(y: number, m: number) {
  const start = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, m, 1, 3, 0, 0)).toISOString();
  const label = `${y}-${String(m).padStart(2, '0')}`;
  return { start, end, label };
}

function mesesRetroativos(n: number): Array<{ y: number; m: number; label: string; start: string; end: string }> {
  const cur = mesAtualBrt();
  const out = [];
  let y = cur.y;
  let m = cur.m;
  for (let i = 0; i < n; i++) {
    out.push({ y, m, ...mesBounds(y, m) });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
}

async function sbCount(
  cfg: { url: string; key: string },
  table: string,
  params: Record<string, string>,
): Promise<number> {
  const q = new URLSearchParams({ ...params, select: 'id', limit: '1' });
  const r = await fetch(`${cfg.url}/rest/v1/${table}?${q}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Prefer: 'count=exact',
    },
  });
  if (!r.ok) {
    console.error(`[portabilidade-historico] ${table} HTTP ${r.status}`);
    throw new Error(`Falha ao contar ${table}.`);
  }
  const cr = r.headers.get('content-range') || '';
  const total = cr.includes('/') ? cr.split('/').pop() : '';
  return Number(total) || 0;
}

type CohortRpc = {
  mes?: string;
  portados?: number;
  falha_parcial?: number;
  canceladas?: number;
  fechados?: number;
  sucesso_tim?: number;
  universo?: number;
  quebras?: number;
  bko?: number;
  execucoes?: number;
  exec_ok?: number;
  activate_ok?: number;
  taxa_portado_pct?: number;
  taxa_sucesso_tim_pct?: number;
  taxa_sucesso_fila_pct?: number;
};

async function cohortViaRpc(
  cfg: { url: string; key: string },
  mesLabel: string,
): Promise<CohortRpc | null> {
  try {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/portabilidade_cohort_stats`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_mes: mesLabel }),
    });
    if (!r.ok) return null;
    return (await r.json()) as CohortRpc;
  } catch {
    return null;
  }
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-historico', 60_000, 20))) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = portabConfig(context.env);
  if (!cfg) return json({ error: 'Secrets portabilidade ausentes.' }, 503);

  const u = new URL(context.request.url);
  const nMeses = Math.min(12, Math.max(3, Number(u.searchParams.get('meses') || 3)));
  const serieMeses = mesesRetroativos(nMeses);

  try {
    const serie = await Promise.all(
      serieMeses.map(async (mes) => {
        const rpc = await cohortViaRpc(cfg, mes.label);
        if (rpc && typeof rpc.portados === 'number') {
          const execucoes = rpc.execucoes ?? 0;
          const fechados = rpc.fechados ?? (rpc.portados ?? 0) + (rpc.falha_parcial ?? 0) + (rpc.canceladas ?? 0);
          const sucessoTim = rpc.sucesso_tim ?? (rpc.portados ?? 0) + (rpc.falha_parcial ?? 0);
          return {
            mes: mes.label,
            portados: rpc.portados ?? 0,
            falha_parcial: rpc.falha_parcial ?? 0,
            canceladas: rpc.canceladas ?? 0,
            fechados,
            sucesso_tim: sucessoTim,
            universo: rpc.universo ?? null,
            quebras: rpc.quebras ?? 0,
            bko: rpc.bko ?? 0,
            execucoes,
            activate_ok: rpc.activate_ok ?? 0,
            taxa_portado_pct:
              rpc.universo && rpc.universo > 0
                ? Math.round(((rpc.portados ?? 0) / rpc.universo) * 1000) / 10
                : rpc.taxa_portado_pct ??
                  (fechados ? Math.round(((rpc.portados ?? 0) / fechados) * 1000) / 10 : 0),
            taxa_sucesso_tim_pct: rpc.taxa_sucesso_tim_pct ?? (rpc.universo ? Math.round((sucessoTim / rpc.universo) * 1000) / 10 : null),
            taxa_sucesso_fila_pct: rpc.taxa_sucesso_fila_pct ?? (execucoes ? Math.round(((rpc.exec_ok ?? 0) / execucoes) * 1000) / 10 : 0),
            fonte: 'rpc',
          };
        }

        const rangeRetorno = `and=(ultimo_retorno_em.gte.${mes.start},ultimo_retorno_em.lt.${mes.end})`;
        const rangeExec = `and=(executed_at.gte.${mes.start},executed_at.lt.${mes.end})`;
        const rangeAg = `and=(updated_at.gte.${mes.start},updated_at.lt.${mes.end})`;

        const [
          portados,
          falha_parcial,
          canceladas,
          exec_ok,
          exec_nok,
          bko,
          quebras,
          activate_ok,
        ] = await Promise.all([
          sbCount(cfg, 'consultas_enviadas_pos_aceite', {
            ticket_status: 'eq.Portado',
            and: `(ultimo_retorno_em.gte.${mes.start},ultimo_retorno_em.lt.${mes.end})`,
          }),
          sbCount(cfg, 'consultas_enviadas_pos_aceite', {
            ticket_status: 'eq.Falha Parcial',
            and: `(ultimo_retorno_em.gte.${mes.start},ultimo_retorno_em.lt.${mes.end})`,
          }),
          sbCount(cfg, 'consultas_enviadas_pos_aceite', {
            ticket_status: 'eq.Portabilidade Cancelada',
            and: `(ultimo_retorno_em.gte.${mes.start},ultimo_retorno_em.lt.${mes.end})`,
          }),
          sbCount(cfg, 'fila_acoes_portabilidade', {
            resultado_is_valid: 'eq.true',
            and: `(executed_at.gte.${mes.start},executed_at.lt.${mes.end})`,
          }),
          sbCount(cfg, 'fila_acoes_portabilidade', {
            resultado_is_valid: 'eq.false',
            and: `(executed_at.gte.${mes.start},executed_at.lt.${mes.end})`,
          }),
          sbCount(cfg, 'fila_acoes_portabilidade', {
            status: 'eq.bko',
            and: `(updated_at.gte.${mes.start},updated_at.lt.${mes.end})`,
          }).catch(() =>
            sbCount(cfg, 'fila_acoes_portabilidade', {
              status: 'eq.bko',
              and: `(executed_at.gte.${mes.start},executed_at.lt.${mes.end})`,
            }),
          ),
          sbCount(cfg, 'aguardando_entrega', {
            status: 'eq.quebra_logistica',
            and: `(updated_at.gte.${mes.start},updated_at.lt.${mes.end})`,
          }),
          sbCount(cfg, 'fila_acoes_portabilidade', {
            acao: 'eq.activate',
            status: 'eq.concluida',
            and: `(executed_at.gte.${mes.start},executed_at.lt.${mes.end})`,
          }),
        ]);

        void rangeRetorno;
        void rangeExec;
        void rangeAg;

        const execucoes = exec_ok + exec_nok;
        const fechados = portados + falha_parcial + canceladas;
        const sucessoTim = portados + falha_parcial;
        return {
          mes: mes.label,
          portados,
          falha_parcial,
          canceladas,
          fechados,
          sucesso_tim: sucessoTim,
          universo: null,
          quebras,
          bko,
          execucoes,
          activate_ok,
          taxa_portado_pct: fechados
            ? Math.round((portados / fechados) * 1000) / 10
            : 0,
          taxa_sucesso_tim_pct: null,
          taxa_sucesso_fila_pct: execucoes
            ? Math.round((exec_ok / execucoes) * 1000) / 10
            : 0,
          fonte: 'count',
        };
      }),
    );

    const atual = serie[serie.length - 1];
    const ant = serie.length > 1 ? serie[serie.length - 2] : null;
    const delta = (a: number, b: number) => a - b;

    return json({
      ok: true,
      gerado_em: new Date().toISOString(),
      meses: nMeses,
      serie,
      comparativo: ant && atual
        ? {
            vs_mes_anterior: {
              portados: delta(atual.portados, ant.portados),
              quebras: delta(atual.quebras, ant.quebras),
              bko: delta(atual.bko, ant.bko),
              taxa_portado_pct: Math.round((atual.taxa_portado_pct - ant.taxa_portado_pct) * 10) / 10,
              execucoes: delta(atual.execucoes, ant.execucoes),
            },
            mes_atual: atual.mes,
            mes_anterior: ant.mes,
          }
        : null,
    });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return json({ error: msg }, 502);
  }
}
