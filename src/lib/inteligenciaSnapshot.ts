/** Snapshot ao vivo para o Risk Radar — EVA + disparos + advertências. */

import { listAdvertenciasPage, kpisAdvertencias } from './advertenciasService';
import { fetchDashboardJson } from './disparosFormat';
import { fetchEvaLive, resolveCpcMeta, type EvaPayload } from './evaDash';
import type { DisparosPayload } from '../types/portabilidade';

export type LiveSnapshot = {
  fonte: 'live';
  gerado_em: string;
  cpc_pct?: number;
  meta_cpc: number;
  eva_stale_min?: number;
  eva_drop_pct?: number;
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

export function horasRestantesExpediente(agora = new Date(), fimHora = 18, iniHora = 8): number {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  const h = brt.getUTCHours() + brt.getUTCMinutes() / 60;
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

export function extractEvaSignals(eva: EvaPayload, agora = Date.now()) {
  const kpis = eva.discagens?.kpis;
  const cpc_pct = asPct(kpis?.cpc_rate);
  const eva_drop_pct = asPct(kpis?.desligue_agente_rate ?? kpis?.desligue_rate);
  const vendas_hoje = Number(kpis?.sucesso);
  const n_operadores =
    (eva.jornada || []).filter((j) => Boolean(j?.login || j?.user_name)).length ||
    (eva.ranking_operadores || []).length ||
    undefined;
  return {
    cpc_pct,
    eva_stale_min: evaStaleMin(eva.updated_at, agora),
    eva_drop_pct,
    vendas_hoje: Number.isFinite(vendas_hoje) ? vendas_hoje : undefined,
    n_operadores: n_operadores || undefined,
  };
}

export function extractDisparosSignals(d: DisparosPayload) {
  return {
    portabilidade_fila: d.totais_ao_vivo?.pendentes ?? d.totais?.pendentes ?? 0,
    portabilidade_bko: d.totais_ao_vivo?.bko ?? d.totais?.bko ?? 0,
    portabilidade_falha: d.totais_ao_vivo?.falha ?? d.totais?.falha ?? 0,
    portabilidade_mais_24h: d.pendentes_por_idade?.mais_24h ?? 0,
    portabilidade_p0: 0,
  };
}

export async function fetchInteligenciaSnapshot(): Promise<LiveSnapshot> {
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
        Object.assign(snap, extractEvaSignals(eva));
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
