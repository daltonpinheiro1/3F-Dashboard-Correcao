import { sbFetch, type EnvAuth } from './auth';
import { propostasSemRobo, tempoMedioSemRobo } from '../../shared/correcaoPropostas';
import { smsDataVendaIso } from './rrKpis';
import {
  isErroOperacionalServer,
  PARETO_CORTE_PCT,
  paretoRows,
  temErroOperacionalServer,
  zScores,
} from './operacionalIntel';

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
  pareto_erro: Array<{ tipo: string; count: number; pct: number; acum_pct: number }>;
  pareto_corte_pct: number;
  outliers_supervisor: Array<{
    supervisor: string;
    equipe: string;
    z: number;
    taxa_erro_pct: number;
    total: number;
  }>;
  concentracao_erro_pct: number;
  periodo: { de: string; ate: string };
};

/** Intervalo de data_venda (cubo = meia-noite UTC). Nome histórico — não usar offset BRT. */
export function filtroDataVendaBrt(from: string, to: string): { gte: string; lte: string } | null {
  const f = String(from || '').slice(0, 10);
  const t = String(to || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return {
    gte: smsDataVendaIso(f).gte,
    lte: smsDataVendaIso(t).lte,
  };
}

/** Período obrigatório: sem ele o filtro some e a leitura varre a tabela inteira. */
export function periodoAnalyticsInvalido(de: string, ate: string): string | null {
  const dia = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(`${iso}T00:00:00Z`));
  return dia(de) && dia(ate) && de <= ate ? null : 'Período inválido.';
}

type LogRow = {
  proposta_id?: string | null;
  vendedor?: string | null;
  tipos_erro?: string[] | null;
  elapsed_ms?: number | null;
  supervisor?: string | null;
  equipe?: string | null;
  data_venda?: string | null;
};

function countErro(tipos: Record<string, number>, tiposErro: string[] | null | undefined) {
  for (const t of tiposErro || []) {
    if (!isErroOperacionalServer(t)) continue;
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
  const maxRows = 20_000;
  while (offset < maxRows) {
    const params = new URLSearchParams({
      select: 'proposta_id,vendedor,tipos_erro,elapsed_ms,supervisor,equipe,data_venda',
      // Offset só é estável com ordem única; consolidarPorProposta espera ordem cronológica.
      order: 'created_at.asc,id.asc',
      limit: String(page),
      offset: String(offset),
    });
    const janela = filtroDataVendaBrt(from, to);
    if (janela) {
      params.append('data_venda', `gte.${janela.gte}`);
      params.append('data_venda', `lte.${janela.lte}`);
    }
    const r = await sbFetch(env, `/rest/v1/correcao_logs?${params.toString()}`);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Falha analytics: ${r.status} ${t.slice(0, 120)}`);
    }
    const batch = (await r.json()) as LogRow[];
    rows.push(...batch);
    if (batch.length < page) break;
    offset += page;
    if (offset >= maxRows) {
      throw new Error(
        `Período excede ${maxRows.toLocaleString('pt-BR')} registros; reduza o intervalo para evitar indicadores parciais.`,
      );
    }
  }
  return rows;
}

export function aggregateForTest(
  rows: LogRow[],
): Omit<AnalyticsOverview, 'periodo' | 'taxa_erro_tendencia'> {
  return aggregate(rows);
}

const TOP_SUPERVISORES = 30;

type SupervisorLinha = AnalyticsOverview['por_supervisor'][number];

/** Cauda do ranking somada numa linha, para a soma de por_supervisor fechar com o total. */
function outrosSupervisores(
  resto: SupervisorLinha[],
  taxa: (comErro: number, total: number) => number,
): SupervisorLinha {
  const total = resto.reduce((soma, s) => soma + s.total, 0);
  const com_erro = resto.reduce((soma, s) => soma + s.com_erro, 0);
  return { supervisor: 'Outros', equipe: `${resto.length} equipes`, total, com_erro, taxa_erro_pct: taxa(com_erro, total) };
}

function aggregate(passagens: LogRow[]): Omit<AnalyticsOverview, 'periodo' | 'taxa_erro_tendencia'> {
  const rows = propostasSemRobo(passagens);
  const total = rows.length;
  let comErro = 0;
  const tipos: Record<string, number> = {};
  const supMap: Record<string, { supervisor: string; equipe: string; total: number; com_erro: number }> =
    {};

  for (const row of rows) {
    const has = temErroOperacionalServer(row.tipos_erro);
    if (has) comErro++;
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

  const taxa = (comErroN: number, totalN: number) => (totalN ? Math.round((1000 * comErroN) / totalN) / 10 : 0);
  const ranking = Object.values(supMap)
    .map((s) => ({ ...s, taxa_erro_pct: taxa(s.com_erro, s.total) }))
    .sort((a, b) => b.com_erro - a.com_erro);
  const topSupervisores = ranking.slice(0, TOP_SUPERVISORES);
  const resto = ranking.slice(TOP_SUPERVISORES);
  const por_supervisor = resto.length
    ? [...topSupervisores, outrosSupervisores(resto, taxa)]
    : topSupervisores;

  const pareto = paretoRows(
    Object.entries(tipos).map(([label, count]) => ({ label, count })),
    PARETO_CORTE_PCT,
  );
  const elegiveis = topSupervisores.filter((s) => s.total >= 8);
  const zs = zScores(elegiveis.map((s) => s.taxa_erro_pct));
  const outliers_supervisor = elegiveis
    .map((s, i) => ({
      supervisor: s.supervisor,
      equipe: s.equipe,
      z: Math.round((zs[i] || 0) * 100) / 100,
      taxa_erro_pct: s.taxa_erro_pct,
      total: s.total,
    }))
    .filter((s) => s.z >= 1.5)
    .sort((a, b) => b.z - a.z)
    .slice(0, 5);
  const topShare = comErro > 0 ? (topSupervisores[0]?.com_erro || 0) / comErro : 0;

  return {
    total,
    com_erro_operacional: comErro,
    taxa_erro_pct: total ? Math.round((1000 * comErro) / total) / 10 : 0,
    tempo_medio_ms: tempoMedioSemRobo(passagens),
    top_erro,
    supervisores_ativos: new Set(rows.map((r) => r.supervisor).filter(Boolean)).size,
    por_supervisor,
    pareto_erro: pareto.map((p) => ({
      tipo: p.label,
      count: p.count,
      pct: p.pct,
      acum_pct: p.acum_pct,
    })),
    outliers_supervisor,
    concentracao_erro_pct: Math.round(topShare * 1000) / 10,
    pareto_corte_pct: PARETO_CORTE_PCT,
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
