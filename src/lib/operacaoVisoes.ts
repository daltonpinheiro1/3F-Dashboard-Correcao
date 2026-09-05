/**
 * Visões da aba Operação — cálculos puros, alinhados à Hora / Discagens.
 * Live = payload do dia. Hist multi-dia: heatmap = último dia (Hora não soma dias).
 * CPC = cpc/tabuladas. DROP hora = bit Agente Desligou em tab_hora (não imputa queda).
 */
import { brtParts, dataBrtIso, dataRefEva, parseEvaBrtMs, shiftIsoDay } from './brt';
import {
  dropFromDiscagens,
  dropRate,
  matchCampanha,
  type CampanhaOp,
  type EvaAtivo,
  type EvaJornada,
  type EvaPayload,
} from './evaDash';
import { evaStaleMin } from './inteligenciaSnapshot';
import { HORAS, horaKey, mergeSerie } from './horaPageData';
import { resolveBkoRefs, resolveMetaCpcEfetiva } from './metaBkoDinamica';
import { ATRASO_GRACA_SEG, fundirJornada, matchOperadorKey } from './ofensorOp';
import { metaDoSupervisor } from '../store/metaCpcStore';

export const OPERACAO_STALE_MIN = 8;
export const OPERACAO_KA_SOM = 3;
export const DROP_ALERTA_PCT = 25;
export const CPC_AMOSTRA_MIN = 8;

export function cpcOperacional(cpc: number, tabuladas: number): number {
  return tabuladas > 0 ? Math.round((1000 * cpc) / tabuladas) / 10 : 0;
}

/** Mesma ocupação da Hora: capacidade = logado/TMA; ocupação = chamadas/capacidade. */
export function ocupacaoEstiloHora(
  logadoSeg: number,
  tmaSeg: number,
  chamadas: number,
): { capacidade: number; ocupacaoPct: number } {
  const capacidade = tmaSeg > 0 ? logadoSeg / tmaSeg : 0;
  const ocupacaoPct = capacidade > 0 ? Math.round((1000 * chamadas) / capacidade) / 10 : 0;
  return { capacidade, ocupacaoPct };
}

/**
 * Se N agentes instáveis/KA voltarem a produzir 1h no ritmo observado do recorte.
 * Não inventa TMA: sem TMA ou sem ocupação, tabs = 0.
 */
export function whatIfPiso(opts: {
  ka: number;
  tmaSeg: number;
  logadoSeg: number;
  chamadas: number;
}): { ka: number; ocupacaoPct: number; tabs1h: number } {
  const ka = Math.max(0, Math.floor(opts.ka || 0));
  const { ocupacaoPct } = ocupacaoEstiloHora(opts.logadoSeg, opts.tmaSeg, opts.chamadas);
  if (!ka || !(opts.tmaSeg > 0)) return { ka, ocupacaoPct, tabs1h: 0 };
  const tabs1h = Math.round(ka * (3600 / opts.tmaSeg) * (ocupacaoPct / 100) * 10) / 10;
  return { ka, ocupacaoPct, tabs1h };
}

export function payloadHeatmapDia(
  tab: 'live' | 'hist',
  live: EvaPayload | null,
  hist: EvaPayload[],
): EvaPayload | null {
  if (tab === 'live') return live;
  if (!hist.length) return null;
  const ordered = [...hist].sort((a, b) => dataRefEva(a).localeCompare(dataRefEva(b)));
  return ordered[ordered.length - 1] || null;
}

export function weekHistBko(payloads: EvaPayload[]): { vendas: number; cpc: number }[] {
  return payloads.map((p) => {
    const rows = (p.serie_hora || []).filter((r) => matchCampanha(r, 'ACAO_BKO'));
    const tabs = rows.reduce((s, r) => s + (r.total || 0), 0);
    const cpc = rows.reduce((s, r) => s + (r.cpc || 0), 0);
    const vendas = rows.reduce((s, r) => s + (r.sucesso || 0), 0);
    return { vendas, cpc: cpcOperacional(cpc, tabs) };
  });
}

export function metaCasaOperacao(opts: {
  campanha: CampanhaOp;
  metaDiaStore: number;
  payloads: EvaPayload[];
  weekPayloads?: EvaPayload[];
  dataRef: string;
}): number {
  if (opts.campanha !== 'ACAO_BKO') return opts.metaDiaStore;
  const serie = mergeSerie(opts.payloads).filter((r) => matchCampanha(r, 'ACAO_BKO'));
  const refs = resolveBkoRefs({
    serieBko: serie,
    weekHist: weekHistBko(opts.weekPayloads || opts.payloads),
    metaDiaStore: opts.metaDiaStore,
    dataRef: opts.dataRef,
  });
  return resolveMetaCpcEfetiva(opts.campanha, opts.metaDiaStore, refs);
}

export function metaSupervisorOp(
  metasSup: Record<string, number>,
  supervisor: string,
  metaCasa: number,
): number {
  return metaDoSupervisor(metasSup, supervisor, metaCasa);
}

/** DROP agente da hora (tab_hora.horas_drop) — produto via matchCampanha. Sem imputar por supervisor. */
export function dropHoraCanonica(
  payloads: EvaPayload[],
  campanha: CampanhaOp,
): Record<string, { drop: number; tabs: number; rate: number }> {
  const out: Record<string, { drop: number; tabs: number; rate: number }> = {};
  for (const hh of HORAS) {
    const maps = dropFromDiscagens(payloads, campanha, hh);
    let drop = 0;
    let tabs = 0;
    for (const v of Object.values(maps.byTab)) {
      drop += v.drop;
      tabs += v.tabs;
    }
    out[hh] = { drop, tabs, rate: dropRate(drop, tabs) };
  }
  return out;
}

export function horaEntradaBrt(iso?: string | null): string | null {
  const ms = parseEvaBrtMs(iso);
  if (ms == null) return null;
  return String(brtParts(new Date(ms)).h).padStart(2, '0');
}

export function atrasosPorSupHora(
  jornada: EvaJornada[],
  campanha: CampanhaOp,
): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const j of jornada) {
    if (!matchCampanha(j, campanha)) continue;
    const login = (j.login || String(j.id_user || '')).trim();
    if (login && seen.has(login)) continue;
    if (login) seen.add(login);
    const atraso = j.atraso_entrada_seg ?? 0;
    if (atraso < ATRASO_GRACA_SEG) continue;
    const hh = horaEntradaBrt(j.primeiro_login || j.date_login);
    if (!hh) continue;
    const sup = j.supervisor_name || 'Sem supervisor';
    const k = `${sup}|${hh}`;
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

export type HeatmapCelula = {
  supervisor: string;
  hora: string;
  tabs: number;
  cpc: number;
  pct: number;
  atrasos: number;
  dropHoraRate: number;
  abaixoMeta: boolean;
  crise: boolean;
};

export type HeatmapOperacao = {
  dia: string;
  horas: string[];
  supervisores: string[];
  dropHora: Record<string, { drop: number; tabs: number; rate: number }>;
  celulas: HeatmapCelula[];
  horaAtual?: string;
};

export function buildHeatmapOperacao(opts: {
  payload: EvaPayload | null;
  campanha: CampanhaOp;
  jornadaAtraso: EvaJornada[];
  metasSup: Record<string, number>;
  metaCasa: number;
  horaAtual?: string;
}): HeatmapOperacao {
  const dia = dataRefEva(opts.payload);
  const dropHora = dropHoraCanonica(opts.payload ? [opts.payload] : [], opts.campanha);
  const atrasos = atrasosPorSupHora(opts.jornadaAtraso, opts.campanha);
  const acc = new Map<string, { tabs: number; cpc: number }>();
  const supers = new Set<string>();
  for (const r of opts.payload?.hora_supervisor || []) {
    if (!matchCampanha(r, opts.campanha)) continue;
    const hh = horaKey(r.hora);
    const sup = r.supervisor || 'Sem supervisor';
    supers.add(sup);
    const k = `${sup}|${hh}`;
    const prev = acc.get(k) || { tabs: 0, cpc: 0 };
    acc.set(k, { tabs: prev.tabs + (r.total || 0), cpc: prev.cpc + (r.cpc || 0) });
  }
  for (const k of atrasos.keys()) supers.add(k.split('|')[0]);

  const supervisores = [...supers].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const celulas: HeatmapCelula[] = [];
  for (const supervisor of supervisores) {
    const meta = metaSupervisorOp(opts.metasSup, supervisor, opts.metaCasa);
    for (const hora of HORAS) {
      const v = acc.get(`${supervisor}|${hora}`) || { tabs: 0, cpc: 0 };
      const pct = cpcOperacional(v.cpc, v.tabs);
      const nAtraso = atrasos.get(`${supervisor}|${hora}`) || 0;
      const dropHoraRate = dropHora[hora]?.rate || 0;
      celulas.push({
        supervisor,
        hora,
        tabs: v.tabs,
        cpc: v.cpc,
        pct,
        atrasos: nAtraso,
        dropHoraRate,
        abaixoMeta: v.tabs >= CPC_AMOSTRA_MIN && pct < meta,
        crise: nAtraso > 0 && dropHoraRate >= DROP_ALERTA_PCT,
      });
    }
  }
  return { dia, horas: HORAS, supervisores, dropHora, celulas, horaAtual: opts.horaAtual };
}

export type TrilhaPonto = {
  dia: string;
  cpc: number | null;
  pausa: number | null;
  ka: number | null;
  tabs: number;
};

export function eixoTrilha7d(hojeIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftIsoDay(hojeIso.slice(0, 10), i - 6));
}

export function trilhaOfensor(
  payloads: EvaPayload[],
  login: string,
  campanha: CampanhaOp,
  eixo: string[],
): TrilhaPonto[] {
  const byDia = new Map<string, EvaJornada[]>();
  for (const p of payloads) {
    const dia = dataRefEva(p);
    for (const j of p.jornada || []) {
      if (!matchCampanha(j, campanha)) continue;
      if (!matchOperadorKey(j, login)) continue;
      if (!byDia.has(dia)) byDia.set(dia, []);
      byDia.get(dia)!.push(j);
    }
  }
  return eixo.map((dia) => {
    const fused = fundirJornada(byDia.get(dia) || []);
    if (!fused) return { dia, cpc: null, pausa: null, ka: null, tabs: 0 };
    const tabs = fused.tabuladas || 0;
    const logado = fused.logged_time || 0;
    return {
      dia,
      cpc: tabs ? cpcOperacional(fused.cpc || 0, tabs) : null,
      pausa: logado ? Math.round((10000 * (fused.pausa_seg || 0)) / logado) / 100 : null,
      ka: fused.keep_alive_abertos || 0,
      tabs,
    };
  });
}

export function alertaFromLive(
  payload: EvaPayload | null,
  agora = Date.now(),
): { ka: number; staleMin?: number } {
  const ka = (payload?.ativas || []).filter((a) => a.estado === 'instavel').length;
  return { ka, staleMin: evaStaleMin(payload?.updated_at, agora) };
}

export function kaDoPiso(ativas: EvaAtivo[], campanha: CampanhaOp): number {
  return ativas.filter((a) => a.estado === 'instavel' && matchCampanha(a, campanha)).length;
}

export function hojeOperacional(payload?: EvaPayload | null): string {
  return payload ? dataRefEva(payload) : dataBrtIso();
}
