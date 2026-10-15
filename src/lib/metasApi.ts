import { dashboardSessionHeaders, hasDashboardSession } from './dashboardSession';
import { mesBrt } from './brt';
import { useMetaCpcStore } from '../store/metaCpcStore';

export function competenciaAtual(d = new Date()) {
  return mesBrt(d);
}

export type MetaCampanhaRow = {
  campanha_op: string;
  cpc_pct: number;
  vendas_mes: number;
  expediente_horas: number;
};

export type MetasPayload = {
  competencia: string;
  /** Mês de onde os valores vieram; difere de `competencia` quando o mês ainda não foi salvo. */
  competencia_origem?: string | null;
  campanhas: MetaCampanhaRow[];
  supervisores: Array<{ supervisor_name: string; cpc_pct: number }>;
};

type MetasStoreFields = {
  metaDia: number;
  metaMes: number;
  metasSup: Record<string, number>;
  metaVendasMesPort: number;
  metaVendasMesMig: number;
  metaVendasMesBko: number;
  metaVendasMesCc: number;
  metaVendasMesAlgar: number;
  expedienteHorasPort: number;
  expedienteHorasMig: number;
  expedienteHorasBko: number;
  expedienteHorasCc: number;
  expedienteHorasAlgar: number;
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

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
}

/** Campo ausente no payload mantém o valor atual do store (nunca volta ao default do código). */
export function metasPayloadToStore(
  payload: MetasPayload,
  current: MetasStoreFields,
  opts: { replaceSup?: boolean } = {},
): MetasStoreFields {
  const by = Object.fromEntries((payload.campanhas || []).map((c) => [c.campanha_op, c]));
  const todas = by.TODAS;
  const port = by.PORTABILIDADE;
  const mig = by.MIGRACAO;
  const bko = by.ACAO_BKO;
  const cc = by.CONTROLE_CONTROLE;
  const algar = by.ALGAR;
  const sups = payload.supervisores || [];
  const metasSup: Record<string, number> = {};
  for (const s of sups) {
    if (s.supervisor_name) metasSup[s.supervisor_name] = Number(s.cpc_pct);
  }
  return {
    metaDia: num(todas?.cpc_pct, current.metaDia),
    metaMes: num(todas?.cpc_pct, current.metaMes),
    metasSup: sups.length || opts.replaceSup ? metasSup : current.metasSup,
    metaVendasMesPort: num(port?.vendas_mes, current.metaVendasMesPort),
    metaVendasMesMig: num(mig?.vendas_mes, current.metaVendasMesMig),
    metaVendasMesBko: num(bko?.vendas_mes, current.metaVendasMesBko),
    metaVendasMesCc: num(cc?.vendas_mes, current.metaVendasMesCc),
    metaVendasMesAlgar: num(algar?.vendas_mes, current.metaVendasMesAlgar),
    expedienteHorasPort: num(port?.expediente_horas, current.expedienteHorasPort),
    expedienteHorasMig: num(mig?.expediente_horas, current.expedienteHorasMig),
    expedienteHorasBko: num(bko?.expediente_horas, current.expedienteHorasBko),
    expedienteHorasCc: num(cc?.expediente_horas, current.expedienteHorasCc),
    expedienteHorasAlgar: num(algar?.expediente_horas, current.expedienteHorasAlgar),
  };
}

export function applyMetasToStore(payload: MetasPayload, opts: { replaceSup?: boolean } = {}) {
  const store = useMetaCpcStore.getState();
  store.hydrate(metasPayloadToStore(payload, store, opts));
}

export async function hydrateMetasFromApi() {
  try {
    const payload = await fetchMetas();
    if (payload) applyMetasToStore(payload);
  } catch {
    /* fallback localStorage */
  }
}
