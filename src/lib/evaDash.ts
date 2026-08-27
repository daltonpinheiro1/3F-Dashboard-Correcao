/** Payload sincronizado do EVA (Storage eva-dash). */

export const EVA_LIVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eva-dash/live.json`;
export const EVA_HIST_URL = (iso: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eva-dash/historico/${iso}.json`;

export const CPC_META_DEFAULT = 65;
/** @deprecated Preferir useMetaCpcStore().metaDia ou resolveCpcMeta() */
export const CPC_META = CPC_META_DEFAULT;

/** Lê meta do dia do persist Zustand (fallback 65). */
export function resolveCpcMeta(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0 && override <= 100) {
    return override;
  }
  try {
    const raw = localStorage.getItem('3f-meta-cpc');
    if (raw) {
      const j = JSON.parse(raw) as { state?: { metaDia?: number } };
      const n = Number(j?.state?.metaDia);
      if (Number.isFinite(n) && n > 0 && n <= 100) return n;
    }
  } catch {
    /* ignore */
  }
  return CPC_META_DEFAULT;
}
export const PAUSA_META_PCT = 11.84;
export const LOGADO_META_SEG = 5 * 3600 + 50 * 60;

export function isTabulacaoAutomatica(nome?: string | null): boolean {
  const n = (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (n.includes('desligou')) return false;
  return (
    n.includes('automatic') ||
    n.includes('logoff') ||
    n.includes('deslogue automatic') ||
    n.includes('inicio de chamada') ||
    n.includes('inicio chamada')
  );
}

export function isTabNaoCpc(nome?: string | null): boolean {
  const n = (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return [
    'caixa postal',
    'ligacao muda',
    'queda de ligacao',
    'desligou sem',
    'picotando',
    'nao e titular',
  ].some((k) => n.includes(k));
}

function _foldTabNome(nome?: string | null): string {
  return (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Evento operacional de queda/desligue (funil/discagem).
 * Inclui cliente desligou e queda de rede — NÃO implica culpa do agente.
 */
export function isTabEventoQueda(nome?: string | null): boolean {
  const n = _foldTabNome(nome);
  return n.includes('desligou') || n.includes('queda de ligacao');
}

/**
 * Diagnóstico de contato (caixa postal / muda / picotando / queda / desligou).
 * NÃO entra no DROP% do dash — DROP% = só Agente Desligou.
 */
export function isTabDropDiscagem(nome?: string | null): boolean {
  const n = _foldTabNome(nome);
  if (!n) return false;
  if (isTabEventoQueda(nome)) return true;
  return (
    n.includes('caixa postal') ||
    n.includes('ligacao muda') ||
    n.includes('picotando')
  );
}

/**
 * DROP de culpa do agente (“excesso de drop”).
 * - agentHungUp === true  → culpa (bit EVA Agente Desligou / end_interaction_agent_button)
 * - agentHungUp === false → nunca culpa
 * - sem bit: NÃO imputa “desligou sem”, “cliente desligou” nem “queda” (evento, não culpa)
 */
export function isTabDrop(
  nome?: string | null,
  agentHungUp?: boolean | null,
): boolean {
  if (agentHungUp === true) return true;
  if (agentHungUp === false) return false;
  const n = _foldTabNome(nome);
  if (!n) return false;
  if (n.includes('queda de ligacao')) return false;
  if (n.includes('cliente desligou')) return false;
  if (n.includes('desligou sem')) return false;
  return n.includes('agente desligou');
}

export function dropRate(drop: number, tabs: number): number {
  if (!tabs) return 0;
  return Math.round((1000 * drop) / tabs) / 10;
}

/** Máscara de telefone para exibição genérica (PII). */
export function maskPhoneDisplay(areaCode?: number | null, phone?: string | null): string {
  const ddd = areaCode ? String(areaCode).padStart(2, '0') : '';
  const raw = String(phone || '').trim();
  if (!raw && !ddd) return '—';
  // Já mascarado pelo sync (contém *) — não reprocessar
  if (raw.includes('*')) {
    return ddd ? `(${ddd}) ${raw}` : raw;
  }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return ddd ? `(${ddd}) —` : '—';
  const masked =
    digits.length > 4 ? '*'.repeat(digits.length - 4) + digits.slice(-4) : '****';
  return ddd ? `(${ddd}) ${masked}` : masked;
}

/** Telefone completo para monitoramento (Últimas tabulações / ficha operador). */
export function formatPhoneFull(areaCode?: number | null, phone?: string | null): string {
  const ddd = areaCode != null && String(areaCode).trim() !== ''
    ? String(areaCode).replace(/\D/g, '').padStart(2, '0').slice(-2)
    : '';
  const raw = String(phone || '').trim();
  if (!raw && !ddd) return '—';
  if (raw.includes('*')) {
    return ddd ? `(${ddd}) ${raw}` : raw;
  }
  let digits = raw.replace(/\D/g, '');
  if (!digits) return ddd ? `(${ddd}) —` : '—';
  if (ddd && digits.startsWith(ddd) && digits.length >= 10) {
    digits = digits.slice(ddd.length);
  }
  const local =
    digits.length === 9
      ? `${digits.slice(0, 5)}-${digits.slice(5)}`
      : digits.length === 8
        ? `${digits.slice(0, 4)}-${digits.slice(4)}`
        : digits;
  return ddd ? `(${ddd}) ${local}` : local;
}

/** Dígitos para clipboard (DDD + número), vazio se mascarado. */
export function phoneDigitsForCopy(areaCode?: number | null, phone?: string | null): string {
  const raw = String(phone || '').trim();
  if (!raw || raw.includes('*')) return '';
  const ddd = areaCode != null && String(areaCode).trim() !== ''
    ? String(areaCode).replace(/\D/g, '').padStart(2, '0').slice(-2)
    : '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (ddd && !digits.startsWith(ddd)) return `${ddd}${digits}`;
  return digits;
}

/** Agrega DROP de culpa do agente por login (ofensores_tab). */
export function dropPorLogin(
  rows: Array<{ login?: string; nome?: string; total?: number; drop_agente?: number }>,
): Record<string, { drop: number; tabs: number; rate: number; evento: number }> {
  const acc: Record<string, { drop: number; tabs: number; evento: number }> = {};
  for (const r of rows) {
    const login = (r.login || '').trim();
    if (!login) continue;
    if (!acc[login]) acc[login] = { drop: 0, tabs: 0, evento: 0 };
    const n = r.total || 0;
    acc[login].tabs += n;
    if (typeof r.drop_agente === 'number' && r.drop_agente >= 0) {
      acc[login].drop += r.drop_agente;
    } else if (isTabDrop(r.nome)) {
      acc[login].drop += n;
    }
    if (isTabEventoQueda(r.nome)) acc[login].evento += n;
  }
  const out: Record<string, { drop: number; tabs: number; rate: number; evento: number }> = {};
  for (const [login, v] of Object.entries(acc)) {
    out[login] = { ...v, rate: dropRate(v.drop, v.tabs) };
  }
  return out;
}

export type DropAgg = { drop: number; tabs: number; rate: number };

function _normDropKey(s?: string | null): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * DROP% canônico (Agente Desligou) a partir de discagens.por_operador / por_supervisor / tab_hora.
 * Preferir sobre ofensores_tab quando o bit EVA estiver no payload de discagens.
 */
export function dropFromDiscagens(
  payloads: Array<EvaPayload | null | undefined>,
  campanha: CampanhaOp = 'TODAS',
  horaFiltro?: string | null,
): {
  byLogin: Record<string, DropAgg>;
  byName: Record<string, DropAgg>;
  bySup: Record<string, DropAgg>;
  byTab: Record<string, DropAgg>;
} {
  const byLogin: Record<string, { drop: number; tabs: number }> = {};
  const byName: Record<string, { drop: number; tabs: number }> = {};
  const bySup: Record<string, { drop: number; tabs: number }> = {};
  const byTab: Record<string, { drop: number; tabs: number }> = {};
  const hh = horaFiltro && horaFiltro !== 'todas' ? String(horaFiltro).padStart(2, '0').slice(0, 2) : null;

  const bump = (acc: Record<string, { drop: number; tabs: number }>, key: string, drop: number, tabs: number) => {
    if (!key) return;
    if (!acc[key]) acc[key] = { drop: 0, tabs: 0 };
    acc[key].drop += drop;
    acc[key].tabs += tabs;
  };

  for (const p of payloads) {
    if (!p) continue;
    const disc = resolveDiscagens(p);
    for (const o of disc.por_operador || []) {
      if (campanha !== 'TODAS' && o.campanha_op && o.campanha_op !== campanha) continue;
      const drop = Number(o.desligue_agente || 0);
      const tabs = Number(o.tabuladas || 0);
      const login = _normDropKey((o as { login?: string }).login);
      const name = _normDropKey(o.user_name);
      if (login) bump(byLogin, login, drop, tabs);
      if (name) bump(byName, name, drop, tabs);
    }
    for (const s of disc.por_supervisor || []) {
      const drop = Number(s.desligue_agente || 0);
      const tabs = Number(s.tabuladas || 0);
      bump(bySup, _normDropKey(s.supervisor_name), drop, tabs);
    }
    for (const t of disc.tab_hora || []) {
      if (campanha !== 'TODAS' && t.campanha_op && t.campanha_op !== campanha) continue;
      const nome = (t.nome || '').trim();
      if (!nome) continue;
      let drop = Number(t.drop_total || 0);
      let tabs = Number(t.total || 0);
      if (hh) {
        drop = Number(t.horas_drop?.[hh] || 0);
        tabs = Number(t.horas?.[hh] || 0);
      }
      bump(byTab, _normDropKey(nome), drop, tabs);
    }
  }

  const fin = (acc: Record<string, { drop: number; tabs: number }>): Record<string, DropAgg> => {
    const out: Record<string, DropAgg> = {};
    for (const [k, v] of Object.entries(acc)) {
      out[k] = { ...v, rate: dropRate(v.drop, v.tabs) };
    }
    return out;
  };
  return { byLogin: fin(byLogin), byName: fin(byName), bySup: fin(bySup), byTab: fin(byTab) };
}

/** Resolve DROP% do operador: discagens (nome/login) → ofensores_tab. */
export function resolveOpDrop(
  login: string | undefined,
  operador: string | undefined,
  disc: ReturnType<typeof dropFromDiscagens> | null | undefined,
  ofensores?: ReturnType<typeof dropPorLogin>,
): DropAgg {
  const empty: DropAgg = { drop: 0, tabs: 0, rate: 0 };
  if (disc) {
    const byL = disc.byLogin[_normDropKey(login)];
    if (byL && byL.tabs > 0) return byL;
    const byN = disc.byName[_normDropKey(operador)];
    if (byN && byN.tabs > 0) return byN;
  }
  const ot = ofensores?.[(login || '').trim()];
  if (ot) return { drop: ot.drop, tabs: ot.tabs, rate: ot.rate };
  return empty;
}

export function cpcOperacionalDeTab(nome: string, total: number, cpcFlag?: number, fonte?: string): number {
  if (fonte === 'eva') return cpcFlag || 0;
  return isTabNaoCpc(nome) ? 0 : total;
}

export type CampanhaOp = 'TODAS' | 'PORTABILIDADE' | 'MIGRACAO';

export interface EvaPausaDetalhe {
  tipo: string;
  chave: string;
  qtd: number;
  segundos: number;
  media_seg: number;
}

export interface EvaDeslog {
  logout: string;
  relogin: string | null;
  seg: number;
  status?: 'fechado' | 'aberto' | string;
}

export interface EvaAtivo {
  id: number;
  id_user: number;
  user_name: string | null;
  login: string | null;
  supervisor_name: string | null;
  campaign_name: string | null;
  campanha_op?: string;
  date_login: string | null;
  last_keep_alive: string | null;
  estado: string;
  instancias?: number;
  relogins?: number;
  keep_alive_abertos?: number;
  desconexoes?: number;
  tempo_perdido_seg?: number;
  deslogs?: EvaDeslog[];
  turno?: string | null;
  meta_entrada?: string | null;
  atraso_entrada_seg?: number;
  primeiro_login?: string | null;
}

export interface EvaJornada {
  id_user: number;
  user_name: string | null;
  login: string | null;
  supervisor_name: string | null;
  campaign_name: string | null;
  campanha_op?: string;
  date_report?: string | null;
  date_login: string | null;
  date_logout: string | null;
  logins: number | null;
  logged_time: number | null;
  paused_time: number | null;
  tma_seg?: number;
  chamadas?: number;
  tabuladas?: number;
  cpc?: number;
  pct_cpc?: number;
  alerta_cpc?: boolean;
  sucesso?: number;
  vb?: number;
  aprovadas?: number;
  instancias?: number;
  relogins?: number;
  keep_alive_abertos?: number;
  desconexoes?: number;
  tempo_perdido_seg?: number;
  pausa_qtd?: number;
  pausa_seg?: number;
  pausa_media_seg?: number;
  pct_pausa?: number;
  acima_meta_pausa?: boolean;
  status_logado?: string;
  pausas_detalhe?: EvaPausaDetalhe[];
  deslogs?: EvaDeslog[];
  turno?: string | null;
  meta_entrada?: string | null;
  atraso_entrada_seg?: number;
  primeiro_login?: string | null;
  pausa_excedente_seg?: number;
}

export interface EvaChamada {
  id: number;
  user_name: string | null;
  login: string | null;
  supervisor_name: string | null;
  campaign_name: string | null;
  campanha_op?: string;
  classification_name: string | null;
  contact: boolean | null;
  cpc: boolean | null;
  cpc_op?: boolean | null;
  cpc_fonte?: string | null;
  success: boolean | null;
  refusal: boolean | null;
  call_date: string | null;
  call_time: string | null;
  area_code: number | null;
  phone_number: string | null;
  /** EVA end_interaction_agent_button — true se o agente encerrou a ligação */
  agente_desligou?: boolean | null;
}

export interface EvaRankingOp {
  login: string;
  operador: string;
  supervisor: string;
  campanha_op?: string;
  total: number;
  cpc: number;
  sucesso: number;
  recusa: number;
  pct_cpc?: number;
  alerta_cpc?: boolean;
  tma_seg?: number;
  chamadas?: number;
}

export interface EvaTabulacao {
  nome: string;
  total: number;
  cpc?: number;
  cpc_eva?: number;
  cpc_fonte?: string;
  sucesso?: number;
  tma_seg?: number;
  pct?: number;
  campanha_op?: string;
  label?: string;
  att_n?: number;
}

export interface EvaOfensorTab {
  nome: string;
  login: string;
  operador: string;
  supervisor: string;
  campanha_op?: string;
  total: number;
  cpc: number;
  sucesso?: number;
  pct_cpc?: number;
  alerta_cpc?: boolean;
  tma_seg?: number;
  /** Qtd com end_interaction_agent_button=1 (quando sync fornecer) */
  drop_agente?: number;
}

export interface EvaCpcCampanha {
  campanha_op: string;
  tabuladas: number;
  cpc: number;
  cpc_eva?: number;
  pct_cpc: number;
  pct_cpc_eva?: number;
  confiavel: boolean;
  fonte: string;
}

export interface EvaTmaHora {
  nome: string;
  hora: number;
  n: number;
  tma_seg: number;
  pct?: number;
  campanha_op?: string;
}

export interface EvaSerieHora {
  hora: string;
  total: number;
  cpc?: number;
  sucesso?: number;
  pct_cpc?: number;
  campanha_op?: string;
}

export interface EvaHoraSupervisor {
  hora: string;
  supervisor: string;
  campanha_op?: string;
  total: number;
  cpc: number;
  sucesso?: number;
  pct_cpc: number;
}

export interface EvaHoraMotivo {
  hora: string;
  nome: string;
  campanha_op?: string;
  total: number;
  cpc: number;
  pct_cpc: number;
  tma_seg?: number;
  supervisor?: string;
}

export interface EvaHoraOperador {
  hora: string;
  login: string;
  operador: string;
  supervisor: string;
  campanha_op?: string;
  total: number;
  cpc: number;
  sucesso?: number;
  pct_cpc: number;
  motivo?: string;
  motivo_n?: number;
  motivo_pct?: number;
  motivo_source?: 'operador_payload' | 'operador_estimado' | 'supervisor_fallback' | 'global_fallback' | 'indisponivel';
  tma_seg?: number;
  /** Agente Desligou (dia) — enriquecido do bloco discagens */
  drop_agente?: number;
  pct_drop?: number;
}

export interface EvaPayload {
  updated_at: string;
  data: string;
  meta?: { pausa_pct: number; logado_seg: number; cpc_pct: number };
  kpis_operacao: Record<string, number>;
  kpis_chamadas: Record<string, number | boolean>;
  ativas?: EvaAtivo[];
  jornada: EvaJornada[];
  pausas_por_tipo: EvaPausaDetalhe[];
  sessoes?: unknown[];
  chamadas_recente: EvaChamada[];
  tma_por_tabulacao?: EvaTabulacao[];
  tma_hora?: EvaTmaHora[];
  top_tabulacao: EvaTabulacao[];
  por_campanha: { nome: string; total: number }[];
  serie_hora: EvaSerieHora[];
  hora_supervisor?: EvaHoraSupervisor[];
  hora_motivo?: EvaHoraMotivo[];
  hora_operador?: EvaHoraOperador[];
  hora_sup_motivo?: EvaHoraMotivo[];
  ranking_operadores: EvaRankingOp[];
  ofensores_tab?: EvaOfensorTab[];
  cpc_por_campanha?: EvaCpcCampanha[];
  discagens?: EvaDiscagens;
}

export interface EvaDiscagensKpis {
  dialed: number;
  contact: number;
  tabuladas: number;
  cpc: number;
  sucesso: number;
  /** Loc% = agente ÷ tentativas (entregue ao operador) */
  contact_rate: number;
  /** CPC% = CPC ÷ tabuladas (funil humano) */
  cpc_rate: number;
  /** Eficácia global = sucesso ÷ tentativas */
  efficacy: number;
  /** Tabs ÷ tentativas (legado / receptivo) */
  tab_rate?: number;
  /** Tabs ÷ Localizou(agente) — funil humano após entrega */
  alo_tab_rate?: number;
  /** Conv% = sucesso ÷ tabuladas (funil humano) */
  conv_tab?: number;
  /** Alo robô (attendance ROBO filas 1,5) — meta transferência */
  alo_robo?: number;
  alo_robo_rate?: number;
  /** Agente ÷ Alo robô */
  transf_alo_rate?: number;
  dialing_time_seg?: number;
  phones_unicos?: number;
  /** Drop/Desligue (tab DESLIGOU + QUEDA) / tabs */
  desligue?: number;
  desligue_rate?: number;
  /** Hangup via botão do agente (end_interaction_agent_button) */
  desligue_agente?: number;
  desligue_agente_rate?: number;
  /** Evento operacional (queda/desligue cliente), separado da culpa do agente */
  desligue_evento?: number;
}

export interface EvaDiscagensSlice extends EvaDiscagensKpis {
  campanha_op?: string;
  hora?: string;
  mailing?: string;
  /** Nome legível sem timestamp EVA (ex.: Mailing SMS 12-08). */
  mailing_nome?: string;
}

/** Matriz tabulação × hora (relatório oficial dial_details). */
export interface EvaDiscagensTabHora {
  nome: string;
  campanha_op?: string;
  total: number;
  phones?: number;
  pct_phones?: number;
  horas: Record<string, number>;
  pct_hora: Record<string, number>;
  /** Qtd Agente Desligou por hora (end_interaction_agent_button) */
  horas_drop?: Record<string, number>;
  drop_total?: number;
  /** DROP% da tab = drop_total ÷ total */
  pct_drop?: number;
}

export interface EvaDiscagensAmd {
  nome: string;
  dialed: number;
  contact?: number;
  contact_rate?: number;
  pct_dialed?: number;
}

export interface EvaDiscagensAlertaQueda {
  nivel: 'alto' | 'medio' | string;
  tipo?: string;
  mailing: string;
  mailing_nome?: string;
  mailing_codigo?: string;
  campanha_op?: string;
  campanha_label?: string;
  queue_name?: string;
  queue_curta?: string;
  slot?: string;
  slot_hora?: string;
  dialed?: number;
  dialed_mediana_dia?: number;
  dialed_slot_ant?: number;
  delta_vs_dia_pct?: number | null;
  delta_vs_ant_pct?: number | null;
  msg: string;
  msg_curta?: string;
}

export interface EvaDiscagensSerie10Op {
  slot: string;
  slot_hora?: string;
  tabuladas: number;
  cpc: number;
  sucesso: number;
  cpc_rate: number;
  conv_tab: number;
}

export interface EvaDiscagensOperador {
  id_user: number;
  user_name: string;
  /** Alias legado / join — preferir user_name */
  login?: string;
  supervisor_name: string;
  queue_name: string;
  queue_curta?: string;
  campanha_op?: string;
  campanha_label?: string;
  tabuladas: number;
  cpc: number;
  sucesso: number;
  contact?: number;
  cpc_rate: number;
  conv_tab: number;
  conv_loc?: number;
  desligue?: number;
  desligue_rate?: number;
  desligue_agente?: number;
  desligue_agente_rate?: number;
  /** Evento operacional (queda/cliente), não culpa */
  desligue_evento?: number;
  serie_10min?: EvaDiscagensSerie10Op[];
}

export interface EvaDiscagensOutlier extends EvaDiscagensOperador {
  nivel: string;
  fila_cpc_mediana: number;
  fila_conv_mediana: number;
  flags: string[];
  comportamento?: string;
  comportamento_label?: string;
  comportamento_hint?: string;
  acao?: string;
  gap_cpc_pp?: number;
  gap_conv_pp?: number;
  msg: string;
}

export interface EvaDiscagensInsight {
  tipo: string;
  titulo: string;
  detalhe: string;
  severidade: string;
  mailing_nome?: string;
  user_name?: string;
  queue_name?: string;
  queue_curta?: string;
  id_user?: number;
}

export interface EvaDiscagens {
  fonte?: string;
  /** Localizou = attendance humano (agente); Tentativas = mailing_logger. */
  definicao_localizacao?: string;
  universo?: string;
  kpis: EvaDiscagensKpis;
  por_campanha?: EvaDiscagensSlice[];
  serie_hora?: EvaDiscagensSlice[];
  serie_10min?: Array<EvaDiscagensSlice & { slot?: string }>;
  por_mailing?: EvaDiscagensSlice[];
  tab_hora?: EvaDiscagensTabHora[];
  /** Breakdown AMD / classificação do discador (top N). */
  por_amd?: EvaDiscagensAmd[];
  alertas_queda?: EvaDiscagensAlertaQueda[];
  por_fila?: Array<EvaDiscagensSlice & { queue_name?: string; operadores?: number; conv_tab?: number; conv_loc?: number }>;
  por_supervisor?: Array<{
    supervisor_name: string;
    operadores: number;
    tabuladas: number;
    cpc: number;
    sucesso: number;
    cpc_rate: number;
    conv_tab: number;
    conv_loc?: number;
    desligue?: number;
    desligue_rate?: number;
    desligue_agente?: number;
    desligue_agente_rate?: number;
  }>;
  por_operador?: EvaDiscagensOperador[];
  /** DROP agente (end_interaction) por operador × tabulação */
  drop_por_tab_op?: Array<{
    id_user?: number;
    user_name: string;
    nome: string;
    tabuladas?: number;
    drop_agente: number;
  }>;
  outliers_conversao?: EvaDiscagensOutlier[];
  insights_discagens?: EvaDiscagensInsight[];
  metrica_peer?: string;
  metrica_peer_nota?: string;
  definicao_desligue?: string;
  meta?: {
    pausa_pct?: number;
    logado_seg?: number;
    cpc_pct?: number;
    /** True se serie_10min caiu no WHERE sem ROBO (Loc% pode divergir do funil). */
    serie_10min_fallback_humano?: boolean;
  };
}

export interface SupervisorResumo {
  supervisor: string;
  operadores: number;
  logados: number;
  cpc: number;
  tabuladas: number;
  pct_cpc: number;
  alerta_cpc: boolean;
  tma_seg: number;
  pausa_seg: number;
  logado_seg: number;
  pct_pausa: number;
  relogins: number;
  tempo_perdido_seg: number;
  vb: number;
  aprovadas: number;
  sucesso: number;
  pausa_excedente_seg: number;
  chamadas_perdidas: number;
  vendas_perdidas: number;
}

export interface PerdasVendas {
  tempo_deslogue_seg: number;
  tempo_pausa_excedente_seg: number;
  tempo_total_seg: number;
  tma_seg: number;
  chamadas_perdidas: number;
  conversao_pct: number;
  vendas_perdidas: number;
  conversao_vb_pct: number;
  vb_perdidas: number;
  tabuladas: number;
  sucesso: number;
  vb: number;
}

export function pausaExcedenteSeg(pausaSeg: number, logadoSeg: number, metaPct = PAUSA_META_PCT): number {
  if (logadoSeg <= 0) return 0;
  return Math.max(0, pausaSeg - (metaPct / 100) * logadoSeg);
}

export function calcularPerdas(input: {
  tempoDeslogueSeg: number;
  pausaSeg: number;
  logadoSeg: number;
  tmaSeg: number;
  tabuladas: number;
  sucesso: number;
  vb: number;
}): PerdasVendas {
  const pausaExc = pausaExcedenteSeg(input.pausaSeg, input.logadoSeg);
  const total = Math.max(0, input.tempoDeslogueSeg) + pausaExc;
  const tma = input.tmaSeg > 0 ? input.tmaSeg : 0;
  const chamadasPerdidas = tma > 0 ? total / tma : 0;
  const conv = input.tabuladas > 0 ? input.sucesso / input.tabuladas : 0;
  const convVb = input.tabuladas > 0 ? input.vb / input.tabuladas : 0;
  return {
    tempo_deslogue_seg: Math.max(0, input.tempoDeslogueSeg),
    tempo_pausa_excedente_seg: pausaExc,
    tempo_total_seg: total,
    tma_seg: tma,
    chamadas_perdidas: Math.round(chamadasPerdidas * 10) / 10,
    conversao_pct: Math.round(conv * 1000) / 10,
    vendas_perdidas: Math.round(chamadasPerdidas * conv * 10) / 10,
    conversao_vb_pct: Math.round(convVb * 10000) / 100,
    vb_perdidas: Math.round(chamadasPerdidas * convVb * 10) / 10,
    tabuladas: input.tabuladas,
    sucesso: input.sucesso,
    vb: input.vb,
  };
}

export function fmtPerda(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1);
}

/** Inteiro sem ponto de milhar (ex.: 3165431). */
export function fmtInt(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '0';
  if (typeof n === 'string' && (n === '—' || n === '-')) return n;
  const raw = typeof n === 'string' ? n.replace(/\./g, '').replace(',', '.') : n;
  const v = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(v)) return String(n);
  return String(Math.trunc(v));
}

export function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function fmtHms(sec?: number | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function fmtHora(iso?: string | null): string {
  if (!iso) return '—';
  const t = iso.includes('T') ? iso.split('T')[1] : iso;
  return t.slice(0, 8);
}

export function classificarCampanha(name?: string | null): 'PORTABILIDADE' | 'MIGRACAO' | 'OUTROS' {
  const n = (name || '').toLowerCase();
  // Oficial: 1º TIM PORTABILIDADE RECEPTIVO · 2º controle
  if (n.includes('portabilidade') || n.includes('receptivo')) return 'PORTABILIDADE';
  if (n.includes('controle')) return 'MIGRACAO';
  return 'OUTROS';
}

export function matchCampanha(row: { campanha_op?: string; campaign_name?: string | null }, filtro: CampanhaOp): boolean {
  if (filtro === 'TODAS') return true;
  const op = row.campanha_op || classificarCampanha(row.campaign_name);
  return op === filtro;
}

export function consolidarSupervisores(
  jornada: EvaJornada[],
  ativas: EvaAtivo[] = [],
): SupervisorResumo[] {
  const logados = new Set(ativas.map((a) => a.login || String(a.id_user)));
  const acc: Record<string, SupervisorResumo> = {};
  const unique: Record<string, Set<string>> = {};
  const tmaW: Record<string, number> = {};
  const tmaN: Record<string, number> = {};
  const countedLogado = new Set<string>();
  for (const j of jornada) {
    const sup = j.supervisor_name || 'Sem supervisor';
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
      };
      unique[sup] = new Set();
      tmaW[sup] = 0;
      tmaN[sup] = 0;
    }
    const r = acc[sup];
    const login = j.login || String(j.id_user);
    unique[sup].add(login);
    const lk = `${sup}|${login}`;
    if (logados.has(login) && !countedLogado.has(lk)) {
      countedLogado.add(lk);
      r.logados += 1;
    }
    r.cpc += j.cpc || 0;
    r.tabuladas += j.tabuladas || 0;
    r.sucesso += j.sucesso || 0;
    r.pausa_seg += j.pausa_seg || 0;
    r.logado_seg += j.logged_time || 0;
    r.relogins += j.relogins || 0;
    r.tempo_perdido_seg += j.tempo_perdido_seg || 0;
    r.vb += j.vb || 0;
    r.aprovadas += j.aprovadas || 0;
    tmaW[sup] += (j.tma_seg || 0) * (j.chamadas || 0);
    tmaN[sup] += j.chamadas || 0;
  }
  return Object.values(acc)
    .map((r) => {
      r.operadores = unique[r.supervisor].size;
      r.tma_seg = tmaN[r.supervisor] ? Math.round((tmaW[r.supervisor] / tmaN[r.supervisor]) * 10) / 10 : 0;
      r.pct_cpc = r.tabuladas ? Math.round((1000 * r.cpc) / r.tabuladas) / 10 : 0;
      r.alerta_cpc = r.tabuladas >= 8 && r.pct_cpc < resolveCpcMeta();
      r.pct_pausa = r.logado_seg ? Math.round((10000 * r.pausa_seg) / r.logado_seg) / 100 : 0;
      const p = calcularPerdas({
        tempoDeslogueSeg: r.tempo_perdido_seg,
        pausaSeg: r.pausa_seg,
        logadoSeg: r.logado_seg,
        tmaSeg: r.tma_seg,
        tabuladas: r.tabuladas,
        sucesso: r.sucesso,
        vb: r.vb,
      });
      r.pausa_excedente_seg = p.tempo_pausa_excedente_seg;
      r.chamadas_perdidas = p.chamadas_perdidas;
      r.vendas_perdidas = p.vendas_perdidas;
      return r;
    })
    .sort((a, b) => b.logados - a.logados || b.tabuladas - a.tabuladas);
}

export function somarPausas(jornada: EvaJornada[]): EvaPausaDetalhe[] {
  const acc: Record<string, EvaPausaDetalhe> = {};
  for (const j of jornada) {
    for (const p of j.pausas_detalhe || []) {
      if (!acc[p.tipo]) acc[p.tipo] = { tipo: p.tipo, chave: p.chave, qtd: 0, segundos: 0, media_seg: 0 };
      acc[p.tipo].qtd += p.qtd;
      acc[p.tipo].segundos += p.segundos;
    }
  }
  return Object.values(acc)
    .map((p) => ({ ...p, media_seg: p.qtd ? Math.round((p.segundos / p.qtd) * 10) / 10 : 0 }))
    .sort((a, b) => b.segundos - a.segundos);
}

/** Usa bloco nativo `discagens` ou estima a partir de tabuladas/série (selo estimado).
 *  Estimado NÃO inventa discadas≈alo — isso colapsava o funil em 100%.
 *  Sem dial_details: dialed/contact ficam 0; funil parte de tabuladas.
 *  Histórico antigo (sem bloco discagens) reconstrói por_campanha/série a partir de serie_hora.
 */
export function resolveDiscagens(p: EvaPayload | null | undefined): EvaDiscagens {
  const native = p?.discagens;
  const nativeDialed = Number(native?.kpis?.dialed || 0);
  const nativeTabs = Number(native?.kpis?.tabuladas || 0);
  const serieDialed = (native?.serie_hora || []).reduce((s, r) => s + Number(r.dialed || 0), 0);
  const campDialed = (native?.por_campanha || []).reduce((s, r) => s + Number(r.dialed || 0), 0);
  const effectiveDialed = Math.max(nativeDialed, serieDialed, campDialed);

  if (native?.kpis && effectiveDialed > 0) {
    const rate = (n: number, d: number) => {
      if (!d) return 0;
      const pct = (100 * n) / d;
      return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
    };
    // kpis.dialed pode ter ficado 0 com série ainda nativa — reconstrói a partir das fatias
    let kpis = native.kpis;
    if (nativeDialed <= 0 && effectiveDialed > 0) {
      const contact = (native.serie_hora || []).reduce((s, r) => s + Number(r.contact || 0), 0)
        || (native.por_campanha || []).reduce((s, r) => s + Number(r.contact || 0), 0)
        || Number(native.kpis.contact || 0);
      const tabuladas = Number(native.kpis.tabuladas || 0);
      const cpc = Number(native.kpis.cpc || 0);
      const sucesso = Number(native.kpis.sucesso || 0);
      kpis = {
        ...native.kpis,
        dialed: effectiveDialed,
        contact,
        contact_rate: rate(contact, effectiveDialed),
        alo_tab_rate: rate(tabuladas, contact),
        tab_rate: rate(tabuladas, effectiveDialed),
        efficacy: rate(sucesso, effectiveDialed),
        cpc_rate: rate(cpc, tabuladas || contact || 0),
        conv_tab: rate(sucesso, tabuladas),
      };
    }
    return {
      ...native,
      kpis,
      fonte: native.fonte || 'mailing_dial_details',
      tab_hora: native.tab_hora || [],
      por_amd: native.por_amd || [],
      serie_10min: native.serie_10min || [],
      alertas_queda: native.alertas_queda || [],
      por_fila: native.por_fila || [],
      por_supervisor: native.por_supervisor || [],
      por_operador: native.por_operador || [],
      outliers_conversao: native.outliers_conversao || [],
      insights_discagens: native.insights_discagens || [],
    };
  }

  // Snapshot histórico com discagens tabuladas mas dialed=0 (reconstruído): usa séries nativas
  // sem inventar discadas=alo.
  if (native?.kpis && nativeTabs > 0 && (native.serie_hora?.length || native.por_campanha?.length)) {
    const rate = (n: number, d: number) => {
      if (!d) return 0;
      const pct = (100 * n) / d;
      return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
    };
    const serie_hora = (native.serie_hora || []).map((r) => ({
      ...r,
      dialed: 0,
      contact: 0,
      contact_rate: 0,
      tab_rate: 0,
      efficacy: 0,
      cpc_rate: rate(r.cpc || 0, r.tabuladas || 0),
    }));
    const por_campanha = (native.por_campanha || []).map((r) => ({
      ...r,
      dialed: 0,
      contact: 0,
      contact_rate: 0,
      tab_rate: 0,
      efficacy: 0,
      cpc_rate: rate(r.cpc || 0, r.tabuladas || 0),
    }));
    return {
      ...native,
      fonte: 'estimado_tabuladas',
      definicao_localizacao: 'snapshot sem discadas/Alo (dial_details ausente)',
      kpis: {
        ...native.kpis,
        dialed: 0,
        contact: 0,
        contact_rate: 0,
        tab_rate: 0,
        efficacy: 0,
        cpc_rate: rate(Number(native.kpis.cpc || 0), nativeTabs),
      },
      serie_hora,
      por_campanha,
      tab_hora: native.tab_hora || [],
      por_amd: native.por_amd || [],
    };
  }

  const kc = p?.kpis_chamadas || {};
  const tabuladas = Number(kc.tabuladas || 0);
  const cpc = Number(kc.cpc || 0);
  const sucesso = Number(kc.sucesso || 0);

  // Sem inventar preditivo: discadas/Alo só vêm do dial_details.
  const dialed = 0;
  const contact = 0;

  const rate = (n: number, d: number) => {
    if (!d) return 0;
    const pct = (100 * n) / d;
    return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
  };
  const kpis: EvaDiscagensKpis = {
    dialed,
    contact,
    tabuladas,
    cpc,
    sucesso,
    contact_rate: 0,
    cpc_rate: rate(cpc, tabuladas),
    efficacy: 0,
    tab_rate: 0,
    dialing_time_seg: (p?.jornada || []).reduce((s, j) => s + Number((j as { dialing_time?: number }).dialing_time || 0), 0),
  };

  const porCamp: Record<string, EvaDiscagensSlice> = {};
  const serie_hora: EvaDiscagensSlice[] = (p?.serie_hora || []).map((r) => {
    const t = r.total || 0;
    const cp = r.cpc || 0;
    const su = r.sucesso || 0;
    const cop = r.campanha_op || 'OUTROS';
    if (!porCamp[cop]) {
      porCamp[cop] = {
        campanha_op: cop,
        dialed: 0,
        contact: 0,
        tabuladas: 0,
        cpc: 0,
        sucesso: 0,
        contact_rate: 0,
        cpc_rate: 0,
        efficacy: 0,
        tab_rate: 0,
      };
    }
    porCamp[cop].tabuladas = (porCamp[cop].tabuladas || 0) + t;
    porCamp[cop].cpc = (porCamp[cop].cpc || 0) + cp;
    porCamp[cop].sucesso = (porCamp[cop].sucesso || 0) + su;
    porCamp[cop].cpc_rate = rate(porCamp[cop].cpc || 0, porCamp[cop].tabuladas || 0);

    return {
      hora: String(r.hora),
      campanha_op: cop,
      dialed: 0,
      contact: 0,
      tabuladas: t,
      cpc: cp,
      sucesso: su,
      contact_rate: 0,
      cpc_rate: rate(cp, t),
      efficacy: 0,
      tab_rate: 0,
    };
  });

  return {
    fonte: 'estimado_tabuladas',
    definicao_localizacao: 'histórico/estimado: só tabuladas (discadas/Alo aguardam dial_details)',
    kpis,
    por_campanha: Object.values(porCamp),
    serie_hora,
    por_mailing: [],
    por_amd: [],
  };
}

export async function fetchEvaLive(signal?: AbortSignal): Promise<EvaPayload> {
  const delays = [0, 2000, 5000];
  let lastErr: Error | null = null;
  for (const delay of delays) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(`${EVA_LIVE_URL}?t=${Date.now()}`, { signal });
      if (!r.ok) throw new Error(`Falha ao carregar operação EVA (${r.status})`);
      return await r.json();
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error('Falha após 3 tentativas');
}

export function fetchEvaDia(iso: string, signal?: AbortSignal): Promise<EvaPayload | null> {
  return fetch(`${EVA_HIST_URL(iso)}?t=${Date.now()}`, { signal }).then(async (r) => {
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) {
      console.warn(`[fetchEvaDia] ${iso} HTTP ${r.status}`);
      return null;
    }
    try {
      const p = (await r.json()) as EvaPayload;
      const tabs = Number(p?.kpis_chamadas?.tabuladas || 0);
      const dialed = Number(p?.discagens?.kpis?.dialed || 0);
      if (!tabs && !dialed && !(p?.jornada || []).length) return null;
      return p;
    } catch (e) {
      console.warn(`[fetchEvaDia] ${iso} parse error`, e);
      return null;
    }
  });
}

export async function fetchEvaPeriodo(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<{ dias: EvaPayload[]; faltando: string[] }> {
  const ids = diasEntre(from, to);
  const results = await Promise.all(ids.map(async (d) => ({ d, payload: await fetchEvaDia(d, signal) })));
  return {
    dias: results.filter((x) => x.payload).map((x) => x.payload as EvaPayload),
    faltando: results.filter((x) => !x.payload).map((x) => x.d),
  };
}

export function diasEntre(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return out;
  const cur = new Date(a);
  let guard = 0;
  while (cur <= b && guard < 31) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return out;
}
