import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';

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

export type RiskSignal = {
  id: string;
  module: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
  label: string;
  detail: string;
  action?: { label: string; href: string };
};

export type RiskRadarResult = {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  signals: RiskSignal[];
  resumo: string;
};

export type WhatIfResult = {
  vendas_projetadas: number;
  gap_meta: number;
  impacto_cpc_pct: number;
  horas_fila_extra: number;
  recomendacao: string;
  cenarios: { otimista: number; realista: number; pessimista: number };
};

export type CoachingAction = {
  id: string;
  supervisor_email: string;
  operador_login?: string | null;
  operador_nome?: string | null;
  tipo: string;
  sugestao: string;
  status: 'pendente' | 'feito' | 'adiado' | 'ignorado';
  contexto?: Record<string, unknown>;
  created_at: string;
  concluido_em?: string | null;
};

export type KnowledgeChunk = {
  id: string;
  categoria: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  score?: number;
};

export type TriageResult = {
  classificacao: string;
  confianca: number;
  acao_sugerida: string;
  auto_executavel: boolean;
  motivos: string[];
  log_id?: string | null;
};

export type OperacionalEvent = {
  id: string;
  tipo: string;
  severidade: 'info' | 'warning' | 'critical';
  titulo: string;
  mensagem?: string | null;
  modulo?: string | null;
  created_at: string;
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = dashboardSessionHeaders(init?.headers);
  return fetch(path, { ...init, headers });
}

export async function fetchAnalyticsOverview(de: string, ate: string): Promise<AnalyticsOverview> {
  const qs = new URLSearchParams({ de, ate });
  const r = await apiFetch(`/api/analytics-overview?${qs}`);
  const data = (await r.json().catch(() => ({}))) as AnalyticsOverview & { error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha analytics (${r.status})`);
  return data;
}

export async function fetchRiskRadar(input: Record<string, unknown>): Promise<RiskRadarResult> {
  const r = await apiFetch('/api/risk-radar', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as RiskRadarResult & { error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha risk radar (${r.status})`);
  return data;
}

export async function runWhatIf(input: Record<string, unknown>): Promise<WhatIfResult> {
  const r = await apiFetch('/api/what-if', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as WhatIfResult & { error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha simulador (${r.status})`);
  return data;
}

export async function askCopilot(opts: {
  question: string;
  page?: string;
  risk_input?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
}): Promise<{ texto: string; risk?: RiskRadarResult }> {
  const r = await apiFetch('/api/copilot', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  const data = (await r.json().catch(() => ({}))) as {
    texto?: string;
    risk?: RiskRadarResult;
    error?: string;
  };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha copiloto (${r.status})`);
  if (!data.texto) throw new Error('Resposta vazia do copiloto.');
  return { texto: data.texto, risk: data.risk };
}

export async function listCoaching(status?: string): Promise<CoachingAction[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const r = await apiFetch(`/api/coaching${qs}`);
  const data = (await r.json().catch(() => ({}))) as { rows?: CoachingAction[]; error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha coaching (${r.status})`);
  return data.rows || [];
}

export async function createCoaching(row: {
  sugestao: string;
  tipo?: string;
  operador_login?: string;
  operador_nome?: string;
  contexto?: Record<string, unknown>;
}): Promise<CoachingAction> {
  const r = await apiFetch('/api/coaching', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: CoachingAction; error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha criar coaching (${r.status})`);
  if (!data.row) throw new Error('Resposta inválida.');
  return data.row;
}

export async function patchCoaching(
  id: string,
  status: CoachingAction['status'],
  resultado?: Record<string, unknown>,
): Promise<CoachingAction> {
  const r = await apiFetch(`/api/coaching?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resultado }),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: CoachingAction; error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha atualizar coaching (${r.status})`);
  if (!data.row) throw new Error('Resposta inválida.');
  return data.row;
}

export async function triagePortabilidade(input: Record<string, unknown>): Promise<TriageResult> {
  const r = await apiFetch('/api/portabilidade-triage', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as TriageResult & { error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha triage (${r.status})`);
  return data;
}

export async function searchKnowledge(q: string): Promise<KnowledgeChunk[]> {
  const r = await apiFetch(`/api/knowledge-search?q=${encodeURIComponent(q)}`);
  const data = (await r.json().catch(() => ({}))) as { rows?: KnowledgeChunk[]; error?: string };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha busca (${r.status})`);
  return data.rows || [];
}

export async function fetchEventsRecent(since?: string): Promise<{
  rows: OperacionalEvent[];
  server_time: string;
}> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  const r = await apiFetch(`/api/events-recent${qs}`);
  const data = (await r.json().catch(() => ({}))) as {
    rows?: OperacionalEvent[];
    server_time?: string;
    error?: string;
  };
  if (!r.ok) throwDashboardApiError(r.status, data, `Falha eventos (${r.status})`);
  return { rows: data.rows || [], server_time: data.server_time || new Date().toISOString() };
}
