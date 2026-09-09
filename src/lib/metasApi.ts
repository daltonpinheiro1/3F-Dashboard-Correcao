import { dashboardSessionHeaders, hasDashboardSession } from './dashboardSession';
import { useMetaCpcStore } from '../store/metaCpcStore';

export function competenciaAtual(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type MetaCampanhaRow = {
  campanha_op: string;
  cpc_pct: number;
  vendas_mes: number;
  expediente_horas: number;
};

export type MetasPayload = {
  competencia: string;
  campanhas: MetaCampanhaRow[];
  supervisores: Array<{ supervisor_name: string; cpc_pct: number }>;
};

export async function fetchMetas(competencia?: string): Promise<MetasPayload | null> {
  if (!hasDashboardSession()) return null;
  const q = competencia ? `?competencia=${encodeURIComponent(competencia)}` : '';
  const r = await fetch(`/api/metas${q}`, { headers: dashboardSessionHeaders() });
  if (!r.ok) return null;
  const body = (await r.json()) as MetasPayload;
  if (!body || !Array.isArray(body.campanhas)) return null;
  return body;
}

export function applyMetasToStore(payload: MetasPayload) {
  const by = Object.fromEntries(payload.campanhas.map((c) => [c.campanha_op, c]));
  const todas = by.TODAS;
  const port = by.PORTABILIDADE;
  const mig = by.MIGRACAO;
  const bko = by.ACAO_BKO;
  const cc = by.CONTROLE_CONTROLE;
  const algar = by.ALGAR;
  const metasSup: Record<string, number> = {};
  for (const s of payload.supervisores || []) {
    if (s.supervisor_name) metasSup[s.supervisor_name] = Number(s.cpc_pct);
  }
  useMetaCpcStore.getState().hydrate({
    metaDia: Number(todas?.cpc_pct ?? useMetaCpcStore.getState().metaDia),
    metaMes: Number(todas?.cpc_pct ?? useMetaCpcStore.getState().metaMes),
    metasSup,
    metaVendasMesPort: Number(port?.vendas_mes ?? 5000),
    metaVendasMesMig: Number(mig?.vendas_mes ?? 5000),
    metaVendasMesBko: Number(bko?.vendas_mes ?? 1000),
    metaVendasMesCc: Number(cc?.vendas_mes ?? 5000),
    metaVendasMesAlgar: Number(algar?.vendas_mes ?? 0),
    expedienteHorasPort: Number(port?.expediente_horas ?? 8),
    expedienteHorasMig: Number(mig?.expediente_horas ?? 8),
    expedienteHorasBko: Number(bko?.expediente_horas ?? 8),
    expedienteHorasCc: Number(cc?.expediente_horas ?? 8),
    expedienteHorasAlgar: Number(algar?.expediente_horas ?? 8),
  });
}

export async function hydrateMetasFromApi() {
  try {
    const payload = await fetchMetas();
    if (payload) applyMetasToStore(payload);
  } catch {
    /* fallback localStorage */
  }
}
