import { sbFetch, type EnvAuth } from './auth';
import { temErroOperacionalServer } from './operacionalIntel';

export type AnalyticsOverview = {
  total: number;
  com_erro_operacional: number;
  taxa_erro_pct: number;
  tempo_medio_ms: number;
  top_erro: string;
  supervisores_ativos: number;
  taxa_erro_tendencia: number;
  por_supervisor: Array<{
    supervisor: string;
    equipe: string;
    total: number;
    com_erro: number;
    taxa_erro_pct: number;
  }>;
  periodo: { de: string; ate: string };
};

type LogRow = {
  tipos_erro?: string[] | null;
  elapsed_ms?: number | null;
  supervisor?: string | null;
  equipe?: string | null;
  data_venda?: string | null;
};

function countErro(tipos: Record<string, number>, tiposErro: string[] | null | undefined) {
  for (const t of tiposErro || []) {
    if (!temErroOperacionalServer(t)) continue;
    tipos[t] = (tipos[t] || 0) + 1;
  }
}

async function fetchLogsRange(
  env: EnvAuth,
  from: string,
  to: string,
): Promise<LogRow[]> {
  const rows: LogRow[] = [];
  let offset = 0;
  const page = 1000;
  while (offset < 20_000) {
    const params = new URLSearchParams({
      select: 'tipos_erro,elapsed_ms,supervisor,equipe,data_venda',
      order: 'created_at.desc',
      limit: String(page),
      offset: String(offset),
    });
    if (from) params.append('data_venda', `gte.${from}T00:00:00`);
    if (to) params.append('data_venda', `lte.${to}T23:59:59`);
    const r = await sbFetch(env, `/rest/v1/correcao_logs?${params.toString()}`);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Falha analytics: ${r.status} ${t.slice(0, 120)}`);
    }
    const batch = (await r.json()) as LogRow[];
    rows.push(...batch);
    if (batch.length < page) break;
    offset += page;
  }
  return rows;
}

function aggregate(rows: LogRow[]): Omit<AnalyticsOverview, 'periodo' | 'taxa_erro_tendencia'> {
  const total = rows.length;
  let comErro = 0;
  let tempoSum = 0;
  const tipos: Record<string, number> = {};
  const supMap: Record<string, { supervisor: string; equipe: string; total: number; com_erro: number }> =
    {};

  for (const row of rows) {
    const has = temErroOperacionalServer(row.tipos_erro);
    if (has) comErro++;
    tempoSum += row.elapsed_ms ?? 0;
    countErro(tipos, row.tipos_erro);

    const sup = (row.supervisor || 'Não identificado').trim() || 'Não identificado';
    const eq = (row.equipe || '-').trim() || '-';
    const k = `${sup}|${eq}`;
    if (!supMap[k]) supMap[k] = { supervisor: sup, equipe: eq, total: 0, com_erro: 0 };
    supMap[k].total++;
    if (has) supMap[k].com_erro++;
  }

  const top_erro =
    Object.entries(tipos).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const por_supervisor = Object.values(supMap)
    .map((s) => ({
      ...s,
      taxa_erro_pct: s.total ? Math.round((1000 * s.com_erro) / s.total) / 10 : 0,
    }))
    .sort((a, b) => b.com_erro - a.com_erro)
    .slice(0, 30);

  return {
    total,
    com_erro_operacional: comErro,
    taxa_erro_pct: total ? Math.round((1000 * comErro) / total) / 10 : 0,
    tempo_medio_ms: total ? Math.round(tempoSum / total) : 0,
    top_erro,
    supervisores_ativos: new Set(rows.map((r) => r.supervisor).filter(Boolean)).size,
    por_supervisor,
  };
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

export async function buildAnalyticsOverview(
  env: EnvAuth,
  from: string,
  to: string,
): Promise<AnalyticsOverview> {
  const rows = await fetchLogsRange(env, from, to);
  const base = aggregate(rows);

  const span = daysBetween(from, to);
  let taxa_erro_tendencia = 0;
  if (span >= 2) {
    const mid = new Date(`${from}T12:00:00`);
    mid.setDate(mid.getDate() + Math.floor(span / 2));
    const midStr = mid.toISOString().slice(0, 10);
    const first = rows.filter((r) => (r.data_venda || '').slice(0, 10) <= midStr);
    const second = rows.filter((r) => (r.data_venda || '').slice(0, 10) > midStr);
    const a1 = aggregate(first);
    const a2 = aggregate(second);
    taxa_erro_tendencia = Math.round((a2.taxa_erro_pct - a1.taxa_erro_pct) * 10) / 10;
  }

  return {
    ...base,
    taxa_erro_tendencia,
    periodo: { de: from, ate: to },
  };
}
