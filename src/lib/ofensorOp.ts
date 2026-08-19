import {
  CPC_META,
  LOGADO_META_SEG,
  PAUSA_META_PCT,
  calcularPerdas,
  fmtDur,
  fmtHms,
  fmtHora,
  isTabNaoCpc,
  pausaExcedenteSeg,
  type EvaAtivo,
  type EvaChamada,
  type EvaDeslog,
  type EvaJornada,
  type EvaOfensorTab,
  type EvaPausaDetalhe,
  type EvaTabulacao,
} from './evaDash';

export const ATRASO_GRACA_SEG = 60;
const CORTE_TURNO_H = 13;

export type FocoId = 'atraso' | 'deslogue' | 'pausa' | 'cpc' | 'logado';

export interface FocoOfensor {
  id: FocoId;
  titulo: string;
  detalhe: string;
  gravidade: number;
  nivel: 'critico' | 'alto' | 'medio';
}

export interface AnaliseOperador {
  login: string;
  nome: string;
  supervisor: string;
  campanha: string;
  ofensor: boolean;
  score: number;
  nivel: 'critico' | 'alto' | 'ok';
  focos: FocoOfensor[];
  turno: 'manha' | 'tarde' | null;
  metaEntrada: string;
  atrasoSeg: number;
  primeiroLogin: string | null;
  deslogs: EvaDeslog[];
  jornada: EvaJornada;
  perdas: ReturnType<typeof calcularPerdas>;
}

function parseHora(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function derivarEntrada(iso?: string | null): {
  turno: 'manha' | 'tarde' | null;
  meta: string;
  atrasoSeg: number;
} {
  const d = parseHora(iso);
  if (!d) return { turno: null, meta: '09:00', atrasoSeg: 0 };
  const h = d.getHours() + d.getMinutes() / 60;
  const turno: 'manha' | 'tarde' = h < CORTE_TURNO_H ? 'manha' : 'tarde';
  const meta = turno === 'manha' ? '09:00' : '15:00';
  const [mh, mm] = meta.split(':').map(Number);
  const alvo = new Date(d);
  alvo.setHours(mh, mm, 0, 0);
  const atraso = Math.max(0, Math.floor((d.getTime() - alvo.getTime()) / 1000));
  return { turno, meta, atrasoSeg: atraso < ATRASO_GRACA_SEG ? 0 : atraso };
}

export function fundirJornada(rows: EvaJornada[]): EvaJornada | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const base: EvaJornada = {
    ...rows[0],
    tabuladas: 0,
    cpc: 0,
    sucesso: 0,
    chamadas: 0,
    vb: 0,
    aprovadas: 0,
  };
  const deslogs: EvaDeslog[] = [];
  const pausas: Record<string, EvaPausaDetalhe> = {};
  for (const r of rows) {
    base.logged_time = Math.max(base.logged_time || 0, r.logged_time || 0);
    base.pausa_seg = Math.max(base.pausa_seg || 0, r.pausa_seg || 0);
    base.pausa_qtd = Math.max(base.pausa_qtd || 0, r.pausa_qtd || 0);
    base.tabuladas = (base.tabuladas || 0) + (r.tabuladas || 0);
    base.cpc = (base.cpc || 0) + (r.cpc || 0);
    base.sucesso = (base.sucesso || 0) + (r.sucesso || 0);
    base.chamadas = Math.max(base.chamadas || 0, r.chamadas || 0);
    base.vb = (base.vb || 0) + (r.vb || 0);
    base.aprovadas = (base.aprovadas || 0) + (r.aprovadas || 0);
    base.relogins = Math.max(base.relogins || 0, r.relogins || 0);
    base.tempo_perdido_seg = Math.max(base.tempo_perdido_seg || 0, r.tempo_perdido_seg || 0);
    base.instancias = Math.max(base.instancias || 0, r.instancias || 0);
    base.tma_seg = Math.max(base.tma_seg || 0, r.tma_seg || 0);
    for (const d of r.deslogs || []) deslogs.push(d);
    for (const p of r.pausas_detalhe || []) {
      const prev = pausas[p.chave];
      if (!prev || (p.segundos || 0) > (prev.segundos || 0)) pausas[p.chave] = { ...p };
    }
    if ((r.atraso_entrada_seg || 0) > (base.atraso_entrada_seg || 0)) {
      base.atraso_entrada_seg = r.atraso_entrada_seg;
      base.turno = r.turno;
      base.meta_entrada = r.meta_entrada;
      base.primeiro_login = r.primeiro_login;
    }
  }
  const seen = new Set<string>();
  base.deslogs = deslogs.filter((d) => {
    const k = `${d.logout}|${d.relogin}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  base.pausas_detalhe = Object.values(pausas).map((p) => ({
    ...p,
    media_seg: p.qtd ? Math.round((p.segundos / p.qtd) * 10) / 10 : 0,
  }));
  const tab = base.tabuladas || 0;
  base.pct_cpc = tab ? Math.round((1000 * (base.cpc || 0)) / tab) / 10 : 0;
  base.alerta_cpc = tab >= 8 && (base.pct_cpc || 0) < CPC_META;
  const logado = base.logged_time || 0;
  base.pct_pausa = logado ? Math.round((10000 * (base.pausa_seg || 0)) / logado) / 100 : 0;
  base.acima_meta_pausa = (base.pct_pausa || 0) > PAUSA_META_PCT;
  base.pausa_excedente_seg = pausaExcedenteSeg(base.pausa_seg || 0, logado);
  base.status_logado = logado >= LOGADO_META_SEG ? 'entregue' : 'nao_entregue';
  return base;
}

export function preverSaida(j: EvaJornada, agora = new Date()): {
  hora: string;
  iso: string | null;
  faltaLogado: number;
  entregue: boolean;
  emAndamento: boolean;
  atrasada: boolean;
} {
  const logado = j.logged_time || 0;
  const pausa = j.pausa_seg || 0;
  const deslogue = j.tempo_perdido_seg || 0;
  const faltaLogado = Math.max(0, LOGADO_META_SEG - logado);
  const primeiro = parseHora(j.primeiro_login || j.date_login);
  const entregue = logado >= LOGADO_META_SEG;
  if (!primeiro) {
    return { hora: '—', iso: null, faltaLogado, entregue, emAndamento: !entregue, atrasada: false };
  }
  const saida = new Date(primeiro.getTime() + (LOGADO_META_SEG + pausa + deslogue) * 1000);
  const hora = saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const atrasada = !entregue && agora.getTime() > saida.getTime();
  const emAndamento = !entregue && !atrasada;
  return { hora, iso: saida.toISOString(), faltaLogado, entregue, emAndamento, atrasada };
}

function nivelDe(g: number): 'critico' | 'alto' | 'medio' {
  if (g >= 70) return 'critico';
  if (g >= 40) return 'alto';
  return 'medio';
}

export function analisarOperador(j: EvaJornada): AnaliseOperador {
  const primeiro = j.primeiro_login || j.date_login;
  const derivado = derivarEntrada(primeiro);
  const turno = (j.turno === 'manha' || j.turno === 'tarde' ? j.turno : derivado.turno);
  const metaEntrada = j.meta_entrada || derivado.meta;
  const atrasoSeg = j.atraso_entrada_seg != null && j.atraso_entrada_seg >= 0
    ? j.atraso_entrada_seg
    : derivado.atrasoSeg;
  const deslogs = j.deslogs || [];
  const logado = j.logged_time || 0;
  const pausaSeg = j.pausa_seg || 0;
  const pausaExc = j.pausa_excedente_seg ?? pausaExcedenteSeg(pausaSeg, logado);
  const pctPausa = j.pct_pausa || 0;
  const pctCpc = j.pct_cpc || 0;
  const tab = j.tabuladas || 0;
  const perdas = calcularPerdas({
    tempoDeslogueSeg: j.tempo_perdido_seg || 0,
    pausaSeg,
    logadoSeg: logado,
    tmaSeg: j.tma_seg || 0,
    tabuladas: tab,
    sucesso: j.sucesso || 0,
    vb: j.vb || 0,
  });

  const focos: FocoOfensor[] = [];
  if (atrasoSeg >= ATRASO_GRACA_SEG) {
    const g = Math.min(100, Math.round((atrasoSeg / 60) * 2.2));
    focos.push({
      id: 'atraso',
      titulo: `Atraso ${turno === 'tarde' ? 'tarde' : 'manhã'}`,
      detalhe: `Entrada ${fmtHora(primeiro)} · meta ${metaEntrada} · +${fmtDur(atrasoSeg)}`,
      gravidade: g,
      nivel: nivelDe(g),
    });
  }
  if ((j.relogins || 0) > 0 || (j.tempo_perdido_seg || 0) >= 15) {
    const g = Math.min(100, Math.round((j.tempo_perdido_seg || 0) / 15 + (j.relogins || 0) * 10));
    focos.push({
      id: 'deslogue',
      titulo: 'Deslogue / relogin',
      detalhe: `${j.relogins || 0} relogin(s) · ${fmtDur(j.tempo_perdido_seg)} fora (15s–12min)`,
      gravidade: Math.max(28, g),
      nivel: nivelDe(Math.max(28, g)),
    });
  }
  if (j.acima_meta_pausa || pausaExc > 30) {
    const g = Math.min(100, Math.round(Math.max(0, pctPausa - PAUSA_META_PCT) * 8));
    focos.push({
      id: 'pausa',
      titulo: 'Estouro de pausa',
      detalhe: `${pctPausa.toFixed(1)}% do logado (meta ${PAUSA_META_PCT}%) · excedente ${fmtDur(pausaExc)}`,
      gravidade: Math.max(35, g),
      nivel: nivelDe(Math.max(35, g)),
    });
  }
  if (j.alerta_cpc || (tab >= 8 && pctCpc < CPC_META)) {
    const g = Math.min(100, Math.round(Math.max(0, CPC_META - pctCpc) * 2.4));
    focos.push({
      id: 'cpc',
      titulo: 'CPC abaixo da meta',
      detalhe: `${pctCpc.toFixed(1)}% · ${j.cpc || 0}/${tab} humanas · meta ${CPC_META}%`,
      gravidade: Math.max(30, g),
      nivel: nivelDe(Math.max(30, g)),
    });
  }
  const saida = preverSaida(j);
  if (saida.atrasada) {
    const g = Math.min(90, 40 + Math.round(saida.faltaLogado / 90));
    focos.push({
      id: 'logado',
      titulo: 'Jornada não entregue',
      detalhe: `Logado ${fmtHms(logado)} · saída prevista ${saida.hora} · falta ${fmtDur(saida.faltaLogado)}`,
      gravidade: g,
      nivel: nivelDe(g),
    });
  }
  focos.sort((a, b) => b.gravidade - a.gravidade);
  const score = focos.reduce((s, f) => s + f.gravidade, 0) + Math.round((perdas.vendas_perdidas || 0) * 12);
  const ofensor = focos.length > 0;
  const nivel: AnaliseOperador['nivel'] = !ofensor
    ? 'ok'
    : focos[0].nivel === 'critico' || score >= 90
      ? 'critico'
      : 'alto';

  return {
    login: j.login || '',
    nome: j.user_name || j.login || '—',
    supervisor: j.supervisor_name || '—',
    campanha: j.campanha_op || j.campaign_name || '—',
    ofensor,
    score,
    nivel,
    focos,
    turno,
    metaEntrada,
    atrasoSeg,
    primeiroLogin: primeiro || null,
    deslogs,
    jornada: j,
    perdas,
  };
}

function diaDe(j: EvaJornada): string {
  const d = j.date_report || j.primeiro_login || j.date_login || '';
  return String(d).slice(0, 10);
}

export function jornadaParaFicha(rows: EvaJornada[]): EvaJornada | null {
  if (!rows.length) return null;
  const byDay = new Map<string, EvaJornada[]>();
  for (const j of rows) {
    const d = diaDe(j) || '_';
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(j);
  }
  let best: EvaJornada | null = null;
  let bestScore = -1;
  let bestDia = '';
  for (const [dia, group] of byDay) {
    const fused = fundirJornada(group);
    if (!fused) continue;
    const score = analisarOperador(fused).score;
    if (!best || score > bestScore || (score === bestScore && dia > bestDia)) {
      best = fused;
      bestScore = score;
      bestDia = dia;
    }
  }
  return best;
}

export function listarOfensores(jornada: EvaJornada[]): AnaliseOperador[] {
  const byLoginDay = new Map<string, EvaJornada[]>();
  for (const j of jornada) {
    const login = j.login || String(j.id_user);
    const k = `${login}|${diaDe(j)}`;
    if (!byLoginDay.has(k)) byLoginDay.set(k, []);
    byLoginDay.get(k)!.push(j);
  }
  const best = new Map<string, AnaliseOperador>();
  for (const rows of byLoginDay.values()) {
    const fused = fundirJornada(rows);
    if (!fused) continue;
    const a = analisarOperador(fused);
    if (!a.ofensor) continue;
    const prev = best.get(a.login);
    if (!prev || a.score > prev.score) best.set(a.login, a);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function estadoAtivo(login: string, ativas: EvaAtivo[]): EvaAtivo | undefined {
  return ativas.find((a) => (a.login || String(a.id_user)) === login);
}

export function jornadaUnicaPorLogin(rows: EvaJornada[]): EvaJornada[] {
  const by = new Map<string, EvaJornada[]>();
  for (const j of rows) {
    const k = `${j.login || j.id_user}|${diaDe(j)}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(j);
  }
  const out: EvaJornada[] = [];
  for (const group of by.values()) {
    const fused = fundirJornada(group);
    if (fused) out.push(fused);
  }
  return out;
}

export function tabsDoOperador(login: string, rows: EvaOfensorTab[], tmaTabs: EvaTabulacao[] = []): EvaOfensorTab[] {
  const tmaBy = new Map(tmaTabs.map((t) => [`${t.nome}|${t.campanha_op || ''}`, t.tma_seg || 0]));
  return rows
    .filter((r) => r.login === login)
    .map((r) => {
      // Se o payload de ofensor trouxer `tma_seg: 0` (valor numérico mas incompleto),
      // tratamos como "ausente" para permitir fallback via `tmaTabs`.
      const proprio = typeof r.tma_seg === 'number' && (r.tma_seg || 0) > 0;
      return {
        ...r,
        tma_seg: proprio ? r.tma_seg || 0 : tmaBy.get(`${r.nome}|${r.campanha_op || ''}`) || 0,
      };
    })
    .sort((a, b) => {
      const aOut = isTabNaoCpc(a.nome) ? 1 : 0;
      const bOut = isTabNaoCpc(b.nome) ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return (a.pct_cpc || 0) - (b.pct_cpc || 0);
    });
}

export function chamadasDoOperador(login: string, rows: EvaChamada[]): EvaChamada[] {
  return rows.filter((c) => c.login === login).slice(0, 40);
}
