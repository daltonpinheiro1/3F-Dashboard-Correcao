import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { fetchMatrixHint } from './portabilidade-matrix';

const ACOES = ['consult', 'cancel', 'open', 'activate', 'reschedule'] as const;

type Env = EnvAuth & RateLimitEnv & {
  PORTABILIDADE_SUPABASE_URL?: string;
  PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
};

type AcaoRow = {
  concluidas_hoje: number;
  falha_hoje: number;
  bko_hoje: number;
  enfileiradas_hoje: number;
  pendentes_vencidos: number;
  pendentes_agendados: number;
  pendentes_janela_08h_hoje: number;
  pendentes_janela_08h_amanha: number;
};

function emptyAcao(): AcaoRow {
  return {
    concluidas_hoje: 0,
    falha_hoje: 0,
    bko_hoje: 0,
    enfileiradas_hoje: 0,
    pendentes_vencidos: 0,
    pendentes_agendados: 0,
    pendentes_janela_08h_hoje: 0,
    pendentes_janela_08h_amanha: 0,
  };
}

function portabConfig(env: Env) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

/** Epoch ms — aceita Z ou +00:00. */
function toEpoch(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Início do dia operacional BRT (UTC-3) como ISO UTC. */
function inicioDiaBrt(agora = new Date()): string {
  const spMs = agora.getTime() - 3 * 3600_000;
  const sp = new Date(spMs);
  const y = sp.getUTCFullYear();
  const m = sp.getUTCMonth();
  const d = sp.getUTCDate();
  return new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString(); // 00:00 BRT = 03:00 UTC
}

function mesBoundsBrt(ym: string): { start: string; end: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  return {
    start: new Date(Date.UTC(y, mo - 1, 1, 3, 0, 0)).toISOString(),
    end: new Date(Date.UTC(y, mo, 1, 3, 0, 0)).toISOString(),
    label: `${y}-${String(mo).padStart(2, '0')}`,
  };
}

function mesAtualBrt(agora = new Date()): string {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

function janela08hBrt(agora: Date) {
  const spMs = agora.getTime() - 3 * 3600_000;
  const sp = new Date(spMs);
  const y = sp.getUTCFullYear();
  const m = sp.getUTCMonth();
  const d = sp.getUTCDate();
  const hoje08Utc = Date.UTC(y, m, d, 11, 0, 0);
  const hoje09Utc = hoje08Utc + 3600_000;
  const amanha08Utc = hoje08Utc + 86400_000;
  const amanha09Utc = amanha08Utc + 3600_000;
  return {
    h08: hoje08Utc,
    h09: hoje09Utc,
    a08: amanha08Utc,
    a09: amanha09Utc,
  };
}

async function sbCount(
  cfg: { url: string; key: string },
  params: Record<string, string>,
): Promise<number> {
  const q = new URLSearchParams({ ...params, select: 'id', limit: '1' });
  const r = await fetch(`${cfg.url}/rest/v1/fila_acoes_portabilidade?${q}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Prefer: 'count=exact',
    },
  });
  if (!r.ok) {
    throw new Error(`Supabase count HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  }
  const cr = r.headers.get('content-range') || '';
  const total = cr.includes('/') ? cr.split('/').pop() : '';
  if (!total || total === '*') return 0;
  return Number(total) || 0;
}

async function buildPainel(cfg: { url: string; key: string }, mesYm?: string) {
  const agora = new Date();
  const agoraMs = agora.getTime();
  const bounds = mesYm ? mesBoundsBrt(mesYm) : null;
  const periodoStart = bounds?.start || inicioDiaBrt(agora);
  const periodoEnd = bounds?.end || null; // null = aberto (só >= start = hoje)
  const hoje = inicioDiaBrt(agora);
  const { h08, h09, a08, a09 } = janela08hBrt(agora);
  const escopoMes = Boolean(bounds);

  const rangeFor = (col: string): Record<string, string> => {
    if (!periodoEnd) return { [col]: `gte.${periodoStart}` };
    return { and: `(${col}.gte.${periodoStart},${col}.lt.${periodoEnd})` };
  };

  const por_acao: Record<string, AcaoRow> = {};
  for (const acao of ACOES) por_acao[acao] = emptyAcao();

  const dayJobs: Promise<void>[] = [];
  for (const acao of ACOES) {
    dayJobs.push(
      (async () => {
        const [concluidas, falha, bko, enfileiradas] = await Promise.all([
          sbCount(cfg, {
            acao: `eq.${acao}`,
            status: 'eq.concluida',
            ...rangeFor('executed_at'),
          }),
          sbCount(cfg, {
            acao: `eq.${acao}`,
            status: 'eq.falha',
            ...rangeFor('executed_at'),
          }),
          sbCount(cfg, {
            acao: `eq.${acao}`,
            status: 'eq.bko',
            ...rangeFor('executed_at'),
          }),
          sbCount(cfg, {
            acao: `eq.${acao}`,
            status: 'eq.pendente',
            ...rangeFor('created_at'),
          }),
        ]);
        por_acao[acao].concluidas_hoje = concluidas;
        por_acao[acao].falha_hoje = falha;
        por_acao[acao].bko_hoje = bko;
        por_acao[acao].enfileiradas_hoje = enfileiradas;
      })(),
    );
  }
  await Promise.all(dayJobs);

  let truncated = false;
  for (let offset = 0; offset < 30000; offset += 1000) {
    const q = new URLSearchParams({
      status: 'eq.pendente',
      select: 'acao,executar_apos',
      offset: String(offset),
      limit: '1000',
    });
    const r = await fetch(`${cfg.url}/rest/v1/fila_acoes_portabilidade?${q}`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    });
    if (!r.ok) break;
    const batch = (await r.json()) as Array<{ acao?: string; executar_apos?: string }>;
    if (!batch.length) break;
    for (const row of batch) {
      const acao = row.acao || '';
      if (!por_acao[acao]) continue;
      const eaMs = toEpoch(row.executar_apos);
      if (eaMs == null || eaMs <= agoraMs) por_acao[acao].pendentes_vencidos += 1;
      else por_acao[acao].pendentes_agendados += 1;
      if (eaMs != null && eaMs >= h08 && eaMs < h09) por_acao[acao].pendentes_janela_08h_hoje += 1;
      else if (eaMs != null && eaMs >= a08 && eaMs < a09) por_acao[acao].pendentes_janela_08h_amanha += 1;
    }
    if (batch.length < 1000) break;
    if (offset + 1000 >= 30000) truncated = true;
  }

  const h6 = new Date(agoraMs - 6 * 3600_000).toISOString();
  const h24 = new Date(agoraMs - 24 * 3600_000).toISOString();

  let mxHint = { matrix_version: '', matrix_version_tag: '' };
  try {
    mxHint = await fetchMatrixHint(cfg);
  } catch {
    /* badge opcional — não derruba o painel */
  }

  const [okPeriodo, nokPeriodo, pendentesAoVivo, concluidasGlob, bkoGlob, falhaGlob, pend6h, pend24h] =
    await Promise.all([
      sbCount(cfg, { resultado_is_valid: 'eq.true', ...rangeFor('executed_at') }),
      sbCount(cfg, { resultado_is_valid: 'eq.false', ...rangeFor('executed_at') }),
      sbCount(cfg, { status: 'eq.pendente' }),
      sbCount(cfg, { status: 'eq.concluida' }),
      sbCount(cfg, { status: 'eq.bko' }),
      sbCount(cfg, { status: 'eq.falha' }),
      sbCount(cfg, { status: 'eq.pendente', created_at: `gte.${h6}` }),
      sbCount(cfg, { status: 'eq.pendente', created_at: `lt.${h24}` }),
    ]);

  let totaisMes: Record<string, number> | null = null;
  if (escopoMes && periodoEnd) {
    const [pendMes, concMes, bkoMes, falhaMes, enfileiradasMes] = await Promise.all([
      sbCount(cfg, { status: 'eq.pendente', ...rangeFor('created_at') }),
      sbCount(cfg, { status: 'eq.concluida', ...rangeFor('executed_at') }),
      sbCount(cfg, { status: 'eq.bko', ...rangeFor('executed_at') }),
      sbCount(cfg, { status: 'eq.falha', ...rangeFor('executed_at') }),
      sbCount(cfg, { status: 'eq.pendente', ...rangeFor('created_at') }),
    ]);
    totaisMes = {
      pendentes: pendMes,
      concluidas: concMes,
      bko: bkoMes,
      falha: falhaMes,
      enfileiradas: enfileiradasMes,
      execucoes: okPeriodo + nokPeriodo,
    };
  }

  const totalExec = okPeriodo + nokPeriodo;
  const taxa = totalExec > 0 ? Math.round((okPeriodo / totalExec) * 1000) / 10 : 0;

  return {
    ok: true,
    fonte: 'supabase:fila_acoes_portabilidade',
    timestamp: agora.toISOString(),
    dia_operacional_brt: hoje,
    periodo: {
      mes: bounds?.label || null,
      inicio: periodoStart,
      fim: periodoEnd,
      escopo: escopoMes ? 'mes' : 'dia',
      label: escopoMes ? `Mês ${bounds!.label}` : 'Dia BRT (hoje)',
    },
    matrix_version: mxHint.matrix_version,
    matrix_version_tag: mxHint.matrix_version_tag,
    taxa_sucesso_hoje: `${taxa}%`,
    execucoes_hoje: totalExec,
    pendentes_amostra_truncada: truncated,
    totais_ao_vivo: {
      pendentes: pendentesAoVivo,
      concluidas: concluidasGlob,
      bko: bkoGlob,
      falha: falhaGlob,
    },
    totais_mes: totaisMes,
    /** @deprecated use totais_ao_vivo */
    totais: {
      pendentes: pendentesAoVivo,
      concluidas: concluidasGlob,
      bko: bkoGlob,
      falha: falhaGlob,
    },
    pendentes_por_idade: {
      ultimas_6h: pend6h,
      mais_24h: pend24h,
    },
    disparos_dia: {
      nota: escopoMes
        ? `Execuções/enfileiramento no mês ${bounds!.label}. totais_mes = fila no período; totais_ao_vivo = snapshot global (pendentes/janela 08h).`
        : 'Pendentes na janela 08h BRT são o lote de véspera — não confundir com ausência de disparo. Dia = BRT.',
      agora_utc: agora.toISOString(),
      por_acao,
    },
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-disparos', 60_000, 20))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const cfg = portabConfig(context.env);
  if (!cfg) {
    return json(
      {
        error:
          'Secrets PORTABILIDADE_SUPABASE_URL / PORTABILIDADE_SUPABASE_SERVICE_KEY ausentes no Pages.',
      },
      503,
    );
  }

  const u = new URL(context.request.url);
  const mesParam = (u.searchParams.get('mes') || '').trim();
  const mes = mesParam && mesBoundsBrt(mesParam) ? mesBoundsBrt(mesParam)!.label : undefined;

  try {
    return json(await buildPainel(cfg, mes));
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return json({ error: `Falha ao montar disparos: ${msg}` }, 502);
  }
}
