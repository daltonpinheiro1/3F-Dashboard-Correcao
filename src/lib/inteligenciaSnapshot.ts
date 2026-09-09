/** Snapshot ao vivo para o Risk Radar — EVA + disparos + advertências. */

import { listAdvertenciasPage, kpisAdvertencias } from './advertenciasService';
import { dropTotalCanonico, filtrarCampanhaTab, kpisVolumeChamadas } from './chamadasVisoes';
import { fetchDashboardJson } from './disparosFormat';
import {
  dropFromDiscagens,
  dropPorLogin,
  dropRate,
  fetchEvaLive,
  isTabulacaoAutomatica,
  matchCampanha,
  resolveCpcMeta,
  resolveDiscagens,
  type CampanhaOp,
  type EvaPayload,
} from './evaDash';
import { detectarOportunidades } from './portabilidadeProjecoes';
import { brtParts, mesBrt } from './brt';
import type { DisparosPayload, FunilPayload } from '../types/portabilidade';

export const DESVIO_ALERTA_PP = 2;
export const RITMO_VENDAS_FALLBACK = 1.4;

export type LiveSnapshot = {
  fonte: 'live';
  gerado_em: string;
  cpc_pct?: number;
  cpc_casa_pct?: number;
  cpc_casa_n?: number;
  tabuladas_casa?: number;
  meta_cpc: number;
  eva_stale_min?: number;
  eva_drop_pct?: number;
  eva_drop_casa_pct?: number;
  eva_drop_casa_n?: number;
  eva_drop_casa_tabs?: number;
  vendas_hoje?: number;
  n_operadores?: number;
  portabilidade_fila: number;
  portabilidade_p0: number;
  portabilidade_bko: number;
  portabilidade_falha: number;
  portabilidade_mais_24h: number;
  advertencias_pendentes: number;
  advertencias_criticos: number;
  avisos: string[];
};

export function desvioPp(a?: number | null, b?: number | null): number | undefined {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.round(Math.abs(a - b) * 10) / 10;
}

export function alertaDesvioCasa(a?: number | null, b?: number | null): boolean {
  const d = desvioPp(a, b);
  return d != null && d > DESVIO_ALERTA_PP;
}

/** Vendas/op/hora para o what-if — não é CPC%. */
export function ritmoVendasOpHora(opts: {
  vendasHoje: number;
  nOperadores: number;
  horasDecorridas: number;
}): { ritmo: number; fallback: boolean; aviso?: string } {
  const horas = Math.max(0.5, opts.horasDecorridas);
  if (!(opts.nOperadores >= 1) || !(opts.vendasHoje > 0)) {
    return {
      ritmo: RITMO_VENDAS_FALLBACK,
      fallback: true,
      aviso: 'ritmo insuficiente — usando 1.4',
    };
  }
  const raw = opts.vendasHoje / opts.nOperadores / horas;
  const ritmo = Math.min(8, Math.max(0.2, Math.round(raw * 1000) / 1000));
  return { ritmo, fallback: false };
}

export function horasDecorridasExpediente(agora = new Date(), fimHora = 18, iniHora = 8): number {
  const span = Math.max(1, fimHora - iniHora);
  return Math.max(0.5, Math.round((span - horasRestantesExpediente(agora, fimHora, iniHora)) * 10) / 10);
}

export function extractFunilP0(funil: Pick<FunilPayload, 'gerencial' | 'reconciliacao' | 'funil_pontes'>): number {
  if (!funil.gerencial || !funil.reconciliacao) return 0;
  return detectarOportunidades({
    g: funil.gerencial,
    rec: funil.reconciliacao,
    funil: funil as FunilPayload,
  }).filter((o) => o.prioridade === 'P0').length;
}

export function mesBrtIso(agora = new Date()): string {
  return mesBrt(agora);
}

export function horasRestantesExpediente(agora = new Date(), fimHora = 18, iniHora = 8): number {
  const p = brtParts(agora);
  const h = p.h + p.min / 60;
  if (h >= fimHora) return 0.5;
  if (h < iniHora) return fimHora - iniHora;
  return Math.max(0.5, Math.round((fimHora - h) * 10) / 10);
}

/** 0–1 → %, 1–100 → % já pronto. 0.8% realista de CPC não existe; trata como fração. */
export function asPct(raw: number | undefined | null): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  const pct = n <= 1 ? n * 100 : n;
  if (pct > 100) return undefined;
  return Math.round(pct * 10) / 10;
}

export function evaStaleMin(updatedAt: string | undefined, agora = Date.now()): number | undefined {
  if (!updatedAt) return undefined;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.round((agora - t) / 60_000));
}

/** CPC%/DROP% do dialer no mesmo chip da Chamadas — kpis globais só em TODAS. */
export function dialerRatesChip(eva: EvaPayload, campanha: CampanhaOp = 'TODAS') {
  const disc = resolveDiscagens(eva);
  const kpis = disc.kpis;
  if (campanha === 'TODAS') {
    return {
      cpc_pct: asPct(kpis?.cpc_rate),
      eva_drop_pct: asPct(kpis?.desligue_agente_rate),
    };
  }
  const slices = (disc.por_campanha || []).filter((r) => matchCampanha(r, campanha));
  const serie = (disc.serie_hora || []).filter((r) => matchCampanha(r, campanha));
  const src = slices.length ? slices : serie;
  let cpc_pct: number | undefined;
  if (src.length) {
    const tab = src.reduce((s, r) => s + Number(r.tabuladas || 0), 0);
    const cpc = src.reduce((s, r) => s + Number(r.cpc || 0), 0);
    cpc_pct = tab ? Math.round((1000 * cpc) / tab) / 10 : undefined;
  }
  let drop = 0;
  let tabs = 0;
  for (const o of disc.por_operador || []) {
    if (!matchCampanha({ campanha_op: o.campanha_op, campaign_name: o.queue_name }, campanha)) continue;
    drop += Number(o.desligue_agente || 0);
    tabs += Number(o.tabuladas || 0);
  }
  return {
    cpc_pct,
    eva_drop_pct: tabs ? dropRate(drop, tabs) : undefined,
  };
}

function vendasHojeDiscagens(eva: EvaPayload, campanha: CampanhaOp): number | undefined {
  const disc = eva.discagens;
  if (!disc) return undefined;
  if (campanha === 'TODAS') {
    const raw = disc.kpis?.sucesso;
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  const porCampanha = (disc.por_campanha || []).filter((r) => matchCampanha(r, campanha));
  const serie = (disc.serie_hora || []).filter((r) => matchCampanha(r, campanha));
  const source = porCampanha.length ? porCampanha : serie;
  const values = source
    .map((r) => r.sucesso)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return values.length ? values.reduce((sum, n) => sum + n, 0) : undefined;
}

export function extractEvaSignals(eva: EvaPayload, agora = Date.now(), campanha: CampanhaOp = 'TODAS') {
  const dialer = dialerRatesChip(eva, campanha);
  const cpc_pct = dialer.cpc_pct;
  const eva_drop_pct = dialer.eva_drop_pct;
  const vendas_hoje = vendasHojeDiscagens(eva, campanha);
  const jornada = filtrarCampanhaTab(eva.jornada || [], campanha);
  const n_operadores =
    jornada.filter((j) => Boolean(j?.login || j?.user_name)).length ||
    filtrarCampanhaTab(eva.ranking_operadores || [], campanha).length ||
    undefined;

  const ranking = filtrarCampanhaTab(eva.ranking_operadores || [], campanha);
  const tabsHumanas = filtrarCampanhaTab(eva.top_tabulacao || eva.tma_por_tabulacao || [], campanha)
    .filter((t) => !isTabulacaoAutomatica(t.nome))
    .map((t) => ({ total: t.total || 0, cpc: t.cpc || 0 }));
  const casa = kpisVolumeChamadas({ ranking, tabsHumanas });
  const disc = dropFromDiscagens([eva], campanha);
  const ofens = dropPorLogin(eva.ofensores_tab || []);
  const dropCasa = dropTotalCanonico(jornada, disc, ofens);

  return {
    cpc_pct,
    cpc_casa_pct: casa.tabuladas ? casa.pctCpc : undefined,
    cpc_casa_n: casa.cpcN,
    tabuladas_casa: casa.tabuladas,
    eva_stale_min: evaStaleMin(eva.updated_at, agora),
    eva_drop_pct,
    eva_drop_casa_pct: dropCasa.tabs ? dropCasa.rate : undefined,
    eva_drop_casa_n: dropCasa.drop,
    eva_drop_casa_tabs: dropCasa.tabs,
    vendas_hoje,
    n_operadores: n_operadores || undefined,
  };
}

export function extractDisparosSignals(d: DisparosPayload) {
  return {
    portabilidade_fila: d.totais_ao_vivo?.pendentes ?? d.totais?.pendentes ?? 0,
    portabilidade_bko: d.totais_ao_vivo?.bko ?? d.totais?.bko ?? 0,
    portabilidade_falha: d.totais_ao_vivo?.falha ?? d.totais?.falha ?? 0,
    portabilidade_mais_24h: d.pendentes_por_idade?.mais_24h ?? 0,
  };
}

export async function fetchInteligenciaSnapshot(campanha: CampanhaOp = 'TODAS'): Promise<LiveSnapshot> {
  const avisos: string[] = [];
  const snap: LiveSnapshot = {
    fonte: 'live',
    gerado_em: new Date().toISOString(),
    meta_cpc: resolveCpcMeta(),
    portabilidade_fila: 0,
    portabilidade_p0: 0,
    portabilidade_bko: 0,
    portabilidade_falha: 0,
    portabilidade_mais_24h: 0,
    advertencias_pendentes: 0,
    advertencias_criticos: 0,
    avisos,
  };

  const jobs: Array<Promise<void>> = [
    (async () => {
      try {
        const eva = await fetchEvaLive();
        Object.assign(snap, extractEvaSignals(eva, Date.now(), campanha));
      } catch {
        avisos.push('EVA live indisponível');
      }
    })(),
    (async () => {
      try {
        const d = await fetchDashboardJson<DisparosPayload>('/api/portabilidade-disparos');
        Object.assign(snap, extractDisparosSignals(d));
      } catch {
        avisos.push('Fila de disparos indisponível');
      }
    })(),
    (async () => {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const t = ac ? setTimeout(() => ac.abort(), 8_000) : undefined;
      try {
        const funil = await fetchDashboardJson<FunilPayload>(
          `/api/portabilidade-funil?mes=${encodeURIComponent(mesBrtIso())}`,
          ac?.signal,
        );
        snap.portabilidade_p0 = extractFunilP0(funil);
      } catch {
        snap.portabilidade_p0 = 0;
        avisos.push('P0 indisponível (funil)');
      } finally {
        if (t) clearTimeout(t);
      }
    })(),
    (async () => {
      try {
        const [pend, aprov] = await Promise.all([
          listAdvertenciasPage({ status: 'pendente', limit: 80 }),
          listAdvertenciasPage({ status: 'aprovada', limit: 80 }),
        ]);
        const k = kpisAdvertencias([...(pend.rows || []), ...(aprov.rows || [])]);
        snap.advertencias_pendentes = k.pendentes;
        snap.advertencias_criticos = k.criticos;
      } catch {
        avisos.push('Advertências indisponíveis');
      }
    })(),
  ];

  await Promise.all(jobs);
  return snap;
}

export function journeyToTriage(proposta: string, journey: {
  timeline?: Array<{ ts?: string; fonte?: string; titulo?: string; detalhe?: string; status?: string }>;
  resumo?: Record<string, unknown>;
}): {
  proposta_id: string;
  status?: string;
  idade_horas?: number;
  ultimo_erro?: string;
  tem_os?: boolean;
  tem_ticket?: boolean;
  tentativas?: number;
} {
  const ev = journey.timeline || [];
  const last = [...ev].reverse()[0];
  const firstTs = ev[0]?.ts ? Date.parse(ev[0].ts) : NaN;
  const idade_horas = Number.isFinite(firstTs)
    ? Math.max(0, Math.round((Date.now() - firstTs) / 3600_000))
    : undefined;
  const blob = ev.map((e) => `${e.titulo || ''} ${e.detalhe || ''} ${e.status || ''}`).join(' | ');
  const tem_os = /OS\s+[1-9]|order=(?!—)(?!-\s)\S/i.test(blob);
  const tem_ticket = /ticket=(?!—)\S/i.test(blob) || /ticket\s+[1-9]/i.test(blob);
  const lastFila = [...ev].reverse().find((e) => e.fonte === 'fila' || e.detalhe);
  return {
    proposta_id: proposta,
    status: String(last?.status || journey.resumo?.status || ''),
    idade_horas,
    ultimo_erro: String(lastFila?.detalhe || last?.detalhe || blob).slice(0, 240),
    tem_os,
    tem_ticket,
    tentativas: ev.filter((e) => e.fonte === 'fila').length || ev.length,
  };
}
