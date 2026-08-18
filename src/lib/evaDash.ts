/** Payload sincronizado do EVA (Storage eva-dash). */

export const EVA_LIVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eva-dash/live.json`;
export const EVA_HIST_URL = (iso: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eva-dash/historico/${iso}.json`;

export const CPC_META = 40;
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
  relogin: string;
  seg: number;
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
  serie_hora: { hora: string; total: number }[];
  ranking_operadores: EvaRankingOp[];
  ofensores_tab?: EvaOfensorTab[];
  cpc_por_campanha?: EvaCpcCampanha[];
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
  if (n.includes('receptivo') || n.includes('portabilidade')) return 'PORTABILIDADE';
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
      r.alerta_cpc = r.tabuladas >= 8 && r.pct_cpc < CPC_META;
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

export async function fetchEvaLive(): Promise<EvaPayload> {
  const r = await fetch(`${EVA_LIVE_URL}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`Falha ao carregar operação EVA (${r.status})`);
  return r.json();
}

export function fetchEvaDia(iso: string): Promise<EvaPayload | null> {
  return fetch(`${EVA_HIST_URL(iso)}?t=${Date.now()}`).then(async (r) => {
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) return null;
    try {
      const p = (await r.json()) as EvaPayload;
      const tabs = Number(p?.kpis_chamadas?.tabuladas || 0);
      if (!tabs && !(p?.jornada || []).length) return null;
      return p;
    } catch {
      return null;
    }
  });
}

export async function fetchEvaPeriodo(
  from: string,
  to: string,
): Promise<{ dias: EvaPayload[]; faltando: string[] }> {
  const ids = diasEntre(from, to);
  const results = await Promise.all(ids.map(async (d) => ({ d, payload: await fetchEvaDia(d) })));
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
  while (cur <= b && guard < 100) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return out;
}
