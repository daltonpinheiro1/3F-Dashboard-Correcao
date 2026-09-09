/**
 * Visões e merges da aba Chamadas.
 * CPC / TMA / tabuladas = fórmulas já apresentadas (não reinventar).
 * DROP = bit Agente Desligou via discagens — mesmo contrato de Operação / Hora / Discagens.
 */
import {
  cpcOperacionalDeTab,
  dropFromDiscagens,
  dropPorLogin,
  dropRate,
  isTabNaoCpc,
  isTabulacaoAutomatica,
  matchCampanha,
  resolveCpcMeta,
  resolveOpDrop,
  resolveSupDrop,
  tempoDeslogueEfetivo,
  type CampanhaOp,
  type DropAgg,
  type EvaCpcCampanha,
  type EvaOfensorTab,
  type EvaPayload,
  type EvaRankingOp,
  type EvaTabulacao,
  type EvaTmaHora,
  type SupervisorResumo,
} from './evaDash';
import { HORAS, horaKey, mergeSerie } from './horaPageData';
import { DROP_ALERTA_PCT, cpcOperacional, dropHoraCanonica, payloadHeatmapDia } from './operacaoVisoes';

export { DROP_ALERTA_PCT, cpcOperacional };

export function labelTab(nome: string, campanha_op?: string): string {
  if (!campanha_op) return nome;
  const p =
    campanha_op === 'PORTABILIDADE'
      ? 'Port'
      : campanha_op === 'MIGRACAO'
        ? 'Mig'
        : campanha_op === 'ACAO_BKO'
          ? 'BKO'
        : campanha_op === 'CONTROLE_CONTROLE'
            ? 'Ctrl'
            : campanha_op === 'ALGAR'
              ? 'Algar'
            : campanha_op.slice(0, 4);
  return `${p} · ${nome}`;
}

export function filtrarCampanhaTab<T extends { campanha_op?: string; campaign_name?: string | null }>(
  rows: T[],
  campanha: CampanhaOp,
): T[] {
  return rows.filter((r) => matchCampanha(r, campanha));
}

/** Volume canônico da aba: ranking se houver; senão tabs humanas. CPC% = cpc/tabuladas. */
export function kpisVolumeChamadas(opts: {
  ranking: Array<{ total: number; cpc: number; sucesso: number; recusa: number }>;
  tabsHumanas: Array<{ total: number; cpc?: number }>;
}): {
  tabuladasTabs: number;
  tabuladas: number;
  cpcN: number;
  sucN: number;
  recN: number;
  pctCpc: number;
} {
  const tabuladasTabs = opts.tabsHumanas.reduce((s, t) => s + t.total, 0);
  const tabuladasRk = opts.ranking.reduce((s, r) => s + r.total, 0);
  const cpcRk = opts.ranking.reduce((s, r) => s + r.cpc, 0);
  const tabuladas = tabuladasRk > 0 ? tabuladasRk : tabuladasTabs;
  const cpcN = tabuladasRk > 0 ? cpcRk : opts.tabsHumanas.reduce((s, t) => s + (t.cpc || 0), 0);
  const sucN = opts.ranking.reduce((s, r) => s + r.sucesso, 0);
  const recN = opts.ranking.reduce((s, r) => s + r.recusa, 0);
  const pctCpc = tabuladas ? Math.round((1000 * cpcN) / tabuladas) / 10 : 0;
  return { tabuladasTabs, tabuladas, cpcN, sucN, recN, pctCpc };
}

/** TMA ponderado pela jornada — mesmo da Operação. */
export function tmaPonderadoJornada(
  jornada: Array<{ tma_seg?: number; chamadas?: number }>,
  fallback = 0,
): { tma: number; attN: number } {
  const tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
  const attN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
  return { tma: attN ? tmaPond / attN : fallback, attN };
}

/** Mesmo deslogue da Operação: só conta se houver ocorrência (anti fantasma). */
export function tempoPerdidoCanonico(
  jornada: Array<Parameters<typeof tempoDeslogueEfetivo>[0]>,
): number {
  return jornada.reduce((s, j) => s + tempoDeslogueEfetivo(j), 0);
}

/** Projeção: tempo_perdido sem ocorrência vs deslogue efetivo. Não altera DROP/CPC. */
export function projecaoDeslogueFantasma(
  jornada: Array<Parameters<typeof tempoDeslogueEfetivo>[0]>,
  tmaSeg: number,
): { bruto: number; efetivo: number; fantasmaSeg: number; chamadasAMais: number } {
  const efetivo = tempoPerdidoCanonico(jornada);
  const bruto = jornada.reduce((s, j) => s + (j.tempo_perdido_seg || 0), 0);
  const fantasmaSeg = Math.max(0, bruto - efetivo);
  const chamadasAMais = tmaSeg > 0 ? Math.round((fantasmaSeg / tmaSeg) * 10) / 10 : 0;
  return { bruto, efetivo, fantasmaSeg, chamadasAMais };
}

/**
 * DROP casa = soma por operador único (discagens → ofensores).
 * Mesmo algoritmo da Operação (`dropTotal`).
 * Fallback `byLogin` só com jornada vazia — nunca reinflar a casa sob busca/filtro parcial.
 */
export function dropTotalCanonico(
  jornada: Array<{ login?: string | null; user_name?: string | null }>,
  disc: ReturnType<typeof dropFromDiscagens>,
  ofens: ReturnType<typeof dropPorLogin>,
): DropAgg {
  const seen = new Set<string>();
  let drop = 0;
  let tabs = 0;
  for (const j of jornada) {
    const key = (j.login || j.user_name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const d = resolveOpDrop(j.login || undefined, j.user_name || undefined, disc, ofens);
    drop += d.drop;
    tabs += d.tabs;
  }
  if (!tabs && jornada.length === 0) {
    for (const v of Object.values(disc.byLogin)) {
      drop += v.drop;
      tabs += v.tabs;
    }
  }
  return { drop, tabs, rate: dropRate(drop, tabs) };
}

export function anexarDropSup<T extends { supervisor: string }>(
  rows: T[],
  disc: ReturnType<typeof dropFromDiscagens>,
): Array<T & { _drop: number; _drop_rate: number }> {
  return rows.map((s) => {
    const d = resolveSupDrop(s.supervisor, disc);
    return { ...s, _drop: d.drop, _drop_rate: d.rate };
  });
}

export function anexarDropOp<T extends { login: string; operador?: string }>(
  rows: T[],
  disc: ReturnType<typeof dropFromDiscagens>,
  ofens: ReturnType<typeof dropPorLogin>,
): Array<T & { _drop: number; _drop_rate: number }> {
  return rows.map((r) => {
    const d = resolveOpDrop(r.login, r.operador, disc, ofens);
    return { ...r, _drop: d.drop, _drop_rate: d.rate };
  });
}

/** Compara tabuladas da Chamadas (ranking) com a jornada da Operação — sem alterar o número da aba. */
export function auditTabsVsJornada(
  tabuladasChamadas: number,
  jornada: Array<{ tabuladas?: number }>,
  opts?: { buscaAtiva?: boolean; comparavel?: boolean },
): { jornadaTabs: number; delta: number; bate: boolean; comparavel: boolean } {
  const jornadaTabs = jornada.reduce((s, j) => s + (j.tabuladas || 0), 0);
  const comparavel = opts?.comparavel !== false && !opts?.buscaAtiva;
  return {
    jornadaTabs,
    delta: tabuladasChamadas - jornadaTabs,
    bate: tabuladasChamadas === jornadaTabs,
    comparavel,
  };
}

export type OfensorTabVisao = {
  nome: string;
  campanha_op?: string;
  total: number;
  pct: number;
  tma_seg: number;
  abaixoMeta: boolean;
};

/** Pior CPC com volume — visão, não muda totais. */
export function ofensorTabPrincipal(
  tabs: Array<{ nome: string; campanha_op?: string; total: number; cpc: number; tma_seg?: number }>,
  metaCpc: number,
): OfensorTabVisao | null {
  if (!tabs.length) return null;
  const comAmostra = tabs.filter((t) => t.total >= 5);
  const pool = comAmostra.length ? comAmostra : tabs;
  const ranked = [...pool].sort((a, b) => {
    const pa = a.total ? (100 * a.cpc) / a.total : 0;
    const pb = b.total ? (100 * b.cpc) / b.total : 0;
    if (pa !== pb) return pa - pb;
    return b.total - a.total;
  });
  const t = ranked[0];
  const pct = t.total ? Math.round((1000 * t.cpc) / t.total) / 10 : 0;
  return {
    nome: t.nome,
    campanha_op: t.campanha_op,
    total: t.total,
    pct,
    tma_seg: t.tma_seg || 0,
    abaixoMeta: t.total >= 5 && pct < metaCpc,
  };
}

export type PulseHoraChamadas = {
  hora: string;
  /** Tabuladas da série (CPC). */
  tabs: number;
  cpc: number;
  pct: number;
  drop: number;
  /** Denominador do DROP canônico (tab_hora) — distinto de `tabs` da série. */
  dropTabs: number;
  dropRate: number;
  crise: boolean;
};

/** Hist multi-dia: só o último dia (mesmo recorte do heatmap da Operação / Hora). */
export function payloadsPulseHora(
  tab: 'live' | 'hist',
  live: EvaPayload | null,
  hist: EvaPayload[],
): EvaPayload[] {
  if (tab === 'live') return live ? [live] : [];
  const last = payloadHeatmapDia('hist', null, hist);
  return last ? [last] : [];
}

/** CPC da série + DROP hora canônico (tab_hora) — não imputa, não soma no hero. */
export function pulseHoraCpcDrop(payloads: EvaPayload[], campanha: CampanhaOp): PulseHoraChamadas[] {
  const dropHora = dropHoraCanonica(payloads, campanha);
  const byH: Record<string, { tabs: number; cpc: number }> = {};
  for (const r of mergeSerie(payloads).filter((row) => matchCampanha(row, campanha))) {
    const hh = horaKey(r.hora);
    if (!byH[hh]) byH[hh] = { tabs: 0, cpc: 0 };
    byH[hh].tabs += r.total || 0;
    byH[hh].cpc += r.cpc || 0;
  }
  return HORAS.map((hh) => {
    const v = byH[hh] || { tabs: 0, cpc: 0 };
    const d = dropHora[hh] || { drop: 0, tabs: 0, rate: 0 };
    const pct = cpcOperacional(v.cpc, v.tabs);
    return {
      hora: hh,
      tabs: v.tabs,
      cpc: v.cpc,
      pct,
      drop: d.drop,
      dropTabs: d.tabs,
      dropRate: d.rate,
      crise: d.tabs > 0 && d.rate >= DROP_ALERTA_PCT,
    };
  });
}

export function mergeRanking(hist: EvaPayload[]): EvaRankingOp[] {
  const acc: Record<string, EvaRankingOp & { tma_w: number; tma_n: number }> = {};
  for (const h of hist) {
    for (const r of h.ranking_operadores || []) {
      const k = `${r.login}|${r.campanha_op || ''}`;
      const n = r.chamadas || r.total || 0;
      if (!acc[k]) acc[k] = { ...r, tma_w: (r.tma_seg || 0) * n, tma_n: n };
      else {
        acc[k].total += r.total;
        acc[k].cpc += r.cpc;
        acc[k].sucesso += r.sucesso;
        acc[k].recusa += r.recusa;
        acc[k].chamadas = (acc[k].chamadas || 0) + (r.chamadas || 0);
        acc[k].tma_w += (r.tma_seg || 0) * n;
        acc[k].tma_n += n;
      }
    }
  }
  return Object.values(acc).map((r) => {
    const { tma_w, tma_n, ...rest } = r;
    return {
      ...rest,
      tma_seg: tma_n ? Math.round((tma_w / tma_n) * 10) / 10 : r.tma_seg,
      pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
      alerta_cpc: r.total >= 8 && (r.total ? (100 * r.cpc) / r.total : 0) < resolveCpcMeta(),
    };
  });
}

export function mergeOfensores(hist: EvaPayload[]): EvaOfensorTab[] {
  const acc: Record<string, EvaOfensorTab & { tma_w: number }> = {};
  for (const h of hist) {
    for (const r of h.ofensores_tab || []) {
      const k = `${r.nome}|${r.login}|${r.campanha_op || ''}`;
      if (!acc[k]) {
        const rest: EvaOfensorTab = { ...r };
        delete rest.drop_agente;
        acc[k] = { ...rest, tma_w: 0, total: 0, cpc: 0, sucesso: 0 };
      }
      acc[k].total += r.total || 0;
      acc[k].cpc += r.cpc || 0;
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      if (typeof r.drop_agente === 'number' && r.drop_agente >= 0) {
        acc[k].drop_agente = (acc[k].drop_agente || 0) + r.drop_agente;
      }
      acc[k].tma_w += (r.tma_seg || 0) * (r.total || 0);
    }
  }
  return Object.values(acc).map((r) => {
    const pct = r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0;
    const { tma_w, ...rest } = r;
    return {
      ...rest,
      tma_seg: r.total ? Math.round((tma_w / r.total) * 10) / 10 : r.tma_seg,
      pct_cpc: pct,
      alerta_cpc: r.total >= 5 && pct < resolveCpcMeta() && !isTabNaoCpc(r.nome),
    };
  });
}

export function mergeCpcCamp(hist: EvaPayload[]): EvaCpcCampanha[] {
  const acc: Record<
    string,
    { tabuladas: number; cpc: number; cpc_eva: number; evaN: number; fonte: string; confiavel: boolean }
  > = {};
  for (const h of hist) {
    for (const c of h.cpc_por_campanha || []) {
      if (!acc[c.campanha_op]) {
        acc[c.campanha_op] = {
          tabuladas: 0,
          cpc: 0,
          cpc_eva: 0,
          evaN: 0,
          fonte: c.fonte,
          confiavel: c.confiavel,
        };
      }
      acc[c.campanha_op].tabuladas += c.tabuladas;
      acc[c.campanha_op].cpc += c.cpc;
      acc[c.campanha_op].cpc_eva += c.cpc_eva || 0;
      acc[c.campanha_op].evaN += c.tabuladas;
      if (!c.confiavel) acc[c.campanha_op].confiavel = false;
      if (c.fonte !== 'eva') acc[c.campanha_op].fonte = 'tabulacao';
    }
  }
  return Object.entries(acc).map(([campanha_op, v]) => ({
    campanha_op,
    tabuladas: v.tabuladas,
    cpc: v.cpc,
    cpc_eva: v.cpc_eva,
    pct_cpc: v.tabuladas ? Math.round((1000 * v.cpc) / v.tabuladas) / 10 : 0,
    pct_cpc_eva: v.evaN ? Math.round((1000 * v.cpc_eva) / v.evaN) / 10 : 0,
    confiavel: v.confiavel,
    fonte: v.fonte,
  }));
}

export function consolidarDrill(rows: EvaOfensorTab[]): SupervisorResumo[] {
  const tabNome = rows[0]?.nome;
  const acc: Record<string, SupervisorResumo & { ops: Set<string>; tma_w: number }> = {};
  for (const r of rows) {
    const sup = r.supervisor || 'Sem supervisor';
    if (!acc[sup]) {
      acc[sup] = {
        supervisor: sup,
        operadores: 0,
        logados: 0,
        cpc: 0,
        tabuladas: 0,
        pct_cpc: 0,
        alerta_cpc: false,
        tma_seg: 0,
        pausa_seg: 0,
        logado_seg: 0,
        pct_pausa: 0,
        relogins: 0,
        tempo_perdido_seg: 0,
        vb: 0,
        aprovadas: 0,
        sucesso: 0,
        pausa_excedente_seg: 0,
        chamadas_perdidas: 0,
        vendas_perdidas: 0,
        ops: new Set(),
        tma_w: 0,
      };
    }
    acc[sup].ops.add(r.login);
    acc[sup].tabuladas += r.total;
    acc[sup].cpc += r.cpc;
    acc[sup].sucesso += r.sucesso || 0;
    acc[sup].tma_w += (r.tma_seg || 0) * (r.total || 0);
  }
  return Object.values(acc)
    .map((r) => {
      const { ops, tma_w, ...rest } = r;
      rest.operadores = ops.size;
      rest.tma_seg = rest.tabuladas ? Math.round((tma_w / rest.tabuladas) * 10) / 10 : 0;
      rest.pct_cpc = rest.tabuladas ? Math.round((1000 * rest.cpc) / rest.tabuladas) / 10 : 0;
      rest.alerta_cpc = rest.tabuladas >= 5 && rest.pct_cpc < resolveCpcMeta() && !isTabNaoCpc(tabNome);
      return rest;
    })
    .sort((a, b) => a.pct_cpc - b.pct_cpc);
}

export function consolidarTabs(rows: EvaTabulacao[]) {
  const acc: Record<
    string,
    { nome: string; total: number; cpc: number; tma_w: number; att_n: number; campanha_op?: string; fonte?: string }
  > = {};
  for (const t of rows) {
    const k = `${t.nome}|${t.campanha_op || ''}`;
    if (!acc[k]) {
      acc[k] = {
        nome: t.nome,
        total: 0,
        cpc: 0,
        tma_w: 0,
        att_n: 0,
        campanha_op: t.campanha_op,
        fonte: t.cpc_fonte,
      };
    }
    acc[k].total += t.total;
    acc[k].cpc += cpcOperacionalDeTab(t.nome, t.total, t.cpc, t.cpc_fonte);
    acc[k].tma_w += (t.tma_seg || 0) * t.total;
    acc[k].att_n += t.att_n || 0;
    if (t.cpc_fonte && t.cpc_fonte !== 'eva') acc[k].fonte = t.cpc_fonte;
  }
  const list = Object.values(acc).map((t) => ({
    nome: t.nome,
    campanha_op: t.campanha_op,
    label: labelTab(t.nome, t.campanha_op),
    total: t.total,
    cpc: t.cpc,
    cpc_fonte: t.fonte,
    att_n: t.att_n,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
  }));
  const tot = list.reduce((s, t) => s + t.total, 0) || 1;
  return list
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export function consolidarTabsDeOfensores(rows: EvaOfensorTab[]) {
  const acc: Record<string, { nome: string; total: number; cpc: number; tma_w: number; campanha_op?: string }> = {};
  for (const r of rows) {
    if (isTabulacaoAutomatica(r.nome)) continue;
    const k = `${r.nome}|${r.campanha_op || ''}`;
    if (!acc[k]) acc[k] = { nome: r.nome, total: 0, cpc: 0, tma_w: 0, campanha_op: r.campanha_op };
    acc[k].total += r.total;
    acc[k].cpc += r.cpc;
    acc[k].tma_w += (r.tma_seg || 0) * (r.total || 0);
  }
  const list = Object.values(acc).map((t) => ({
    nome: t.nome,
    campanha_op: t.campanha_op,
    label: labelTab(t.nome, t.campanha_op),
    total: t.total,
    cpc: t.cpc,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
    att_n: t.total,
  }));
  const tot = list.reduce((s, t) => s + t.total, 0) || 1;
  return list
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export function consolidarHora(rows: EvaTmaHora[]): EvaTmaHora[] {
  const acc: Record<string, { nome: string; hora: number; n: number; tma_w: number; campanha_op?: string }> = {};
  for (const r of rows) {
    const k = `${r.nome}|${r.hora}|${r.campanha_op || ''}`;
    if (!acc[k]) acc[k] = { nome: r.nome, hora: r.hora, n: 0, tma_w: 0, campanha_op: r.campanha_op };
    acc[k].n += r.n || 0;
    acc[k].tma_w += (r.tma_seg || 0) * (r.n || 0);
  }
  const tot = Object.values(acc).reduce((s, r) => s + r.n, 0) || 1;
  return Object.values(acc).map((r) => ({
    nome: r.nome,
    hora: r.hora,
    n: r.n,
    tma_seg: r.n ? Math.round((r.tma_w / r.n) * 10) / 10 : 0,
    pct: Math.round((10000 * r.n) / tot) / 100,
    campanha_op: r.campanha_op,
  }));
}

export function mergeTabs(hist: EvaPayload[]) {
  const acc: Record<
    string,
    { nome: string; total: number; cpc: number; tma_seg: number; tma_w: number; campanha_op?: string; cpc_fonte?: string }
  > = {};
  for (const h of hist) {
    for (const t of h.tma_por_tabulacao || h.top_tabulacao || []) {
      const k = `${t.nome}|${t.campanha_op || ''}`;
      if (!acc[k]) {
        acc[k] = {
          nome: t.nome,
          total: 0,
          cpc: 0,
          tma_seg: 0,
          tma_w: 0,
          campanha_op: t.campanha_op,
          cpc_fonte: t.cpc_fonte,
        };
      }
      acc[k].total += t.total;
      acc[k].cpc += t.cpc || 0;
      acc[k].tma_w += (t.tma_seg || 0) * t.total;
      if (t.cpc_fonte && t.cpc_fonte !== 'eva') acc[k].cpc_fonte = t.cpc_fonte;
    }
  }
  const rows = Object.values(acc).map((t) => ({
    ...t,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
  }));
  const tot = rows.reduce((s, t) => s + t.total, 0) || 1;
  return rows
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export function mergeTmaHora(hist: EvaPayload[]): EvaTmaHora[] {
  const acc: Record<string, { nome: string; hora: number; n: number; tma_w: number; campanha_op?: string }> = {};
  for (const h of hist) {
    for (const r of h.tma_hora || []) {
      const k = `${r.nome}|${r.hora}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { nome: r.nome, hora: r.hora, n: 0, tma_w: 0, campanha_op: r.campanha_op };
      acc[k].n += r.n || 0;
      acc[k].tma_w += (r.tma_seg || 0) * (r.n || 0);
    }
  }
  const tot = Object.values(acc).reduce((s, r) => s + r.n, 0) || 1;
  return Object.values(acc).map((r) => ({
    nome: r.nome,
    hora: r.hora,
    n: r.n,
    tma_seg: r.n ? Math.round((r.tma_w / r.n) * 10) / 10 : 0,
    pct: Math.round((10000 * r.n) / tot) / 100,
    campanha_op: r.campanha_op,
  }));
}

