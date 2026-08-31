/**
 * Projeções estatísticas e detecção de oportunidades — cohort portabilidade.
 */
import type {
  CmpMes,
  FunilPayload,
  HistoricoPonto,
} from '../types/portabilidade';
import { portadosConsolidadosParaMeta } from './portabilidadeMeta';

export type ProjecaoMes = {
  diasDecorridos: number;
  diasRestantes: number;
  diasUteisRestantes: number;
  ritmoDiarioPortados: number;
  ritmoDiarioSucessoTim: number;
  portadosAtual: number;
  sucessoTimAtual: number;
  fechadosAtual: number;
  emVoo: number;
  universo: number;
  cenarios: {
    otimista: { portados: number; sucessoTim: number; taxaSucessoTimPct: number };
    realista: { portados: number; sucessoTim: number; taxaSucessoTimPct: number };
    pessimista: { portados: number; sucessoTim: number; taxaSucessoTimPct: number };
  };
  monteCarlo: {
    simulacoes: number;
    p10: number;
    p50: number;
    p90: number;
    probBaterRealista: number;
  };
  taxaConversaoEmVooHistorica: number;
  metaImplicita?: number;
  meta?: {
    portados_pct: number;
    meta_portados: number;
    portados_atual: number;
    taxa_atual_pct: number;
    pctAtual: number;
    pctProjetadoRealista: number;
    gapRestante: number;
    probBaterMeta: number;
  };
};

export type Oportunidade = {
  id: string;
  prioridade: 'P0' | 'P1' | 'P2';
  titulo: string;
  descricao: string;
  impacto?: string;
  acao?: string;
  fatiaId?: string;
  valor?: number;
};

const ENDPOINTS: Record<string, string> = {
  consult: '/importers/siebel/portability/consult',
  cancel: '/importers/siebel/portability/cancel',
  open: '/importers/siebel/portability/open',
  activate: '/importers/siebel/chip/activation',
  reschedule: '/importers/siebel/portability/reschedule',
};

export const ACOES_FILA = Object.keys(ENDPOINTS) as Array<keyof typeof ENDPOINTS>;

export function diasMesBrt(ym: string, agora = new Date()): {
  total: number;
  decorridos: number;
  restantes: number;
  uteisRestantes: number;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return { total: 30, decorridos: 15, restantes: 15, uteisRestantes: 11 };
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const total = new Date(y, mo + 1, 0).getDate();
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  const isCurrent =
    sp.getUTCFullYear() === y && sp.getUTCMonth() === mo;
  const decorridos = isCurrent ? sp.getUTCDate() : total;
  const restantes = Math.max(0, total - decorridos);
  let uteisRestantes = 0;
  for (let d = decorridos + 1; d <= total; d++) {
    const dow = new Date(Date.UTC(y, mo, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) uteisRestantes++;
  }
  return { total, decorridos, restantes, uteisRestantes };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function taxaSucessoTim(p: HistoricoPonto): number {
  const fech = p.fechados || 1;
  return Math.round(((p.portados + p.falha_parcial) / Math.max(fech, 1)) * 1000) / 10;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/** PRNG determinístico — evita flicker do Monte Carlo entre re-renders. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h, 1664525) + 1013904223;
    return (h >>> 0) / 0xffffffff;
  };
}

/** Projeção de fechamento do mês — 3 cenários + Monte Carlo sobre em voo. */
export function buildProjecaoMes(opts: {
  mes: string;
  g: FunilPayload['gerencial'];
  rec: FunilPayload['reconciliacao'];
  serie: HistoricoPonto[];
  agora?: Date;
  metaPortados?: number | null;
  metaPortadosPct?: number | null;
}): ProjecaoMes | null {
  const { mes, g, rec, serie } = opts;
  if (!g || !rec?.universo) return null;

  const { decorridos, restantes, uteisRestantes } = diasMesBrt(mes, opts.agora);
  const portadosAtual = g.portados ?? 0;
  const portadosMetaAtual = portadosConsolidadosParaMeta(g);
  const sucessoTimAtual = g.sucesso_tim ?? portadosMetaAtual;
  const fechadosAtual = g.fechados ?? 0;
  const emVoo = rec.em_voo ?? 0;
  const universo = rec.universo;

  const ritmoDiarioPortados = decorridos > 0 ? portadosAtual / decorridos : 0;
  const ritmoDiarioSucessoTim = decorridos > 0 ? sucessoTimAtual / decorridos : 0;

  const taxasHist = serie
    .filter((p) => p.fechados > 0)
    .map((p) => (p.portados + p.falha_parcial) / p.fechados);
  const taxasPortHist = serie.filter((p) => p.fechados > 0).map((p) => p.portados / p.fechados);
  const taxaConv = avg(taxasHist) || (fechadosAtual ? sucessoTimAtual / fechadosAtual : 0.14);
  const taxaPort = avg(taxasPortHist) || (fechadosAtual ? portadosAtual / fechadosAtual : 0.11);
  const taxaBest = taxasHist.length ? Math.max(...taxasHist) : taxaConv * 1.15;
  const taxaWorst = taxasHist.length ? Math.min(...taxasHist) : taxaConv * 0.85;

  const extraFechamentos = (rate: number) => {
    if (restantes <= 0 || emVoo <= 0) return 0;
    const raw = emVoo * rate * (restantes / Math.max(decorridos, 1)) * 0.35;
    return Math.min(Math.round(raw), emVoo);
  };

  const proj = (rateSucesso: number, ratePort: number) => {
    const extraSt = extraFechamentos(rateSucesso);
    const extraP = Math.round(extraSt * (ratePort / Math.max(rateSucesso, 0.01)));
    const st = sucessoTimAtual + extraSt;
    const pt = portadosAtual + extraP;
    return {
      portados: pt,
      sucessoTim: st,
      taxaSucessoTimPct: universo ? Math.round((st / universo) * 1000) / 10 : 0,
    };
  };

  const realista = proj(taxaConv, taxaPort);
  const otimista = proj(taxaBest, taxaBest * 0.85);
  const pessimista = proj(taxaWorst, taxaWorst * 0.75);

  const rng = seededRandom(`${mes}:${sucessoTimAtual}:${emVoo}`);
  const SIMS = 400;
  const sims: number[] = [];
  for (let i = 0; i < SIMS; i++) {
    const jitter = 0.85 + rng() * 0.3;
    const rate = Math.min(0.95, taxaConv * jitter);
    sims.push(sucessoTimAtual + extraFechamentos(rate));
  }
  sims.sort((a, b) => a - b);
  const simsPort: number[] = [];
  for (let i = 0; i < SIMS; i++) {
    const jitter = 0.85 + rng() * 0.3;
    const rate = Math.min(0.95, taxaConv * jitter);
    const ratePortJ = taxaPort * (0.88 + rng() * 0.24);
    const extraSt = extraFechamentos(rate);
    simsPort.push(portadosAtual + Math.round(extraSt * (ratePortJ / Math.max(rate, 0.01))));
  }
  simsPort.sort((a, b) => a - b);

  const metaPct = opts.metaPortadosPct && opts.metaPortadosPct > 0 ? opts.metaPortadosPct : 40;
  const metaPortados =
    opts.metaPortados && opts.metaPortados > 0
      ? Math.round(opts.metaPortados)
      : Math.round((universo * metaPct) / 100);

  return {
    diasDecorridos: decorridos,
    diasRestantes: restantes,
    diasUteisRestantes: uteisRestantes,
    ritmoDiarioPortados: Math.round(ritmoDiarioPortados * 10) / 10,
    ritmoDiarioSucessoTim: Math.round(ritmoDiarioSucessoTim * 10) / 10,
    portadosAtual,
    sucessoTimAtual,
    fechadosAtual,
    emVoo,
    universo,
    cenarios: { otimista, realista, pessimista },
    monteCarlo: {
      simulacoes: SIMS,
      p10: percentile(sims, 0.1),
      p50: percentile(sims, 0.5),
      p90: percentile(sims, 0.9),
      probBaterRealista: Math.round(
        (sims.filter((v) => v >= realista.sucessoTim).length / SIMS) * 1000,
      ) / 10,
    },
    taxaConversaoEmVooHistorica: Math.round(taxaConv * 1000) / 10,
    metaImplicita: realista.portados,
    meta: metaPortados > 0
      ? {
          portados_pct: metaPct,
          meta_portados: metaPortados,
          portados_atual: portadosMetaAtual,
          taxa_atual_pct: universo
            ? Math.round((portadosMetaAtual / universo) * 1000) / 10
            : 0,
          pctAtual: Math.round((portadosMetaAtual / metaPortados) * 1000) / 10,
          pctProjetadoRealista: Math.round((realista.sucessoTim / metaPortados) * 1000) / 10,
          gapRestante: Math.max(0, metaPortados - portadosMetaAtual),
          probBaterMeta: Math.round(
            (sims.filter((v) => v >= metaPortados).length / SIMS) * 1000,
          ) / 10,
        }
      : undefined,
  };
}

/** Regras heurísticas — oportunidades acionáveis a partir do funil. */
export function detectarOportunidades(opts: {
  g: FunilPayload['gerencial'];
  rec: FunilPayload['reconciliacao'];
  funil?: FunilPayload;
  cmpMes?: CmpMes | null;
  projecao?: ProjecaoMes | null;
  historicoMes?: HistoricoPonto | null;
}): Oportunidade[] {
  const { g, rec, funil, cmpMes, projecao, historicoMes } = opts;
  const out: Oportunidade[] = [];
  if (!g || !rec) return out;

  const pontes = funil?.funil_pontes;
  const universo = rec.universo || 1;

  if ((pontes?.ticket_nao_fechado ?? 0) > 200) {
    out.push({
      id: 'ticket_aberto',
      prioridade: 'P0',
      titulo: 'Tickets em aberto — acelerar fechamento',
      descricao: `${pontes?.ticket_nao_fechado} propostas com ticket mas ainda não fecharam.`,
      impacto: `Até ${Math.round(((pontes?.ticket_nao_fechado ?? 0) / universo) * 100)}% do universo`,
      acao: 'Priorizar consult/open na fila e revisar conflitos TIM',
      valor: pontes?.ticket_nao_fechado,
    });
  }

  if ((pontes?.os_sem_ticket ?? 0) > 80) {
    out.push({
      id: 'os_sem_ticket',
      prioridade: 'P1',
      titulo: 'OS sem ticket — gargalo pré-TIM',
      descricao: `${pontes?.os_sem_ticket} propostas com OS 1-* mas sem ticket aberto.`,
      acao: 'Disparar open/consult conforme matrix',
      valor: pontes?.os_sem_ticket,
    });
  }

  if ((g.bko ?? 0) > 50) {
    out.push({
      id: 'bko_alto',
      prioridade: 'P0',
      titulo: 'Fila BKO elevada',
      descricao: `${g.bko} propostas aguardando intervenção manual.`,
      acao: 'Triagem BKO + reenqueue consult após correção',
      fatiaId: 'bko',
      valor: g.bko,
    });
  }

  if ((g.quebras ?? 0) / universo > 0.05) {
    out.push({
      id: 'quebra_logistica',
      prioridade: 'P1',
      titulo: 'Quebra logística acima de 5%',
      descricao: `${g.quebras} quebras Toutbox (${g.taxa_quebra_pct}%).`,
      acao: 'Revisar entregas canceladas/expiradas sem ICCID',
      fatiaId: 'quebra_logistica',
      valor: g.quebras,
    });
  }

  if (cmpMes && cmpMes.portados < -20) {
    out.push({
      id: 'queda_portados',
      prioridade: 'P0',
      titulo: 'Queda de portados vs mês anterior',
      descricao: `Portados ${cmpMes.portados} vs ${cmpMes.mes_anterior}.`,
      acao: 'Investigar mix de cancelamentos e motivos TIM',
    });
  }

  if (projecao && projecao.monteCarlo.probBaterRealista < 45) {
    out.push({
      id: 'projecao_baixa',
      prioridade: 'P1',
      titulo: 'Projeção abaixo do ritmo esperado',
      descricao: `Só ${projecao.monteCarlo.probBaterRealista}% de chance de bater cenário realista (${projecao.cenarios.realista.sucessoTim} sucesso TIM).`,
      acao: 'Intensificar execuções fila nos próximos dias úteis',
    });
  }

  if (
    historicoMes &&
    historicoMes.fechados > 0 &&
    (g.taxa_sucesso_tim_sobre_fechados_pct ?? 0) < taxaSucessoTim(historicoMes) - 2
  ) {
    out.push({
      id: 'taxa_abaixo_hist',
      prioridade: 'P1',
      titulo: 'Taxa sucesso TIM abaixo do histórico',
      descricao: `Atual ${g.taxa_sucesso_tim_sobre_fechados_pct}% sobre fechados vs ${taxaSucessoTim(historicoMes)}% no histórico.`,
      acao: 'Focar em fatias de falha parcial recuperável',
    });
  }

  const topFatia = [...(funil?.fatias || [])].sort((a, b) => b.count - a.count)[0];
  if (topFatia && topFatia.pct > 12 && topFatia.grupo !== 'fechamento') {
    out.push({
      id: `fatia_${topFatia.id}`,
      prioridade: 'P2',
      titulo: `Maior concentração: ${topFatia.label}`,
      descricao: `${topFatia.count} propostas (${topFatia.pct}%) — fora de fechamento.`,
      acao: 'Drill-down e ação direcionada na fatia',
      fatiaId: topFatia.id,
      valor: topFatia.count,
    });
  }

  const prio = { P0: 0, P1: 1, P2: 2 };
  return out.sort((a, b) => prio[a.prioridade] - prio[b.prioridade]).slice(0, 8);
}

export function serieTendencia(serie: HistoricoPonto[]) {
  return [...serie].map((p) => ({
      mes: p.mes.slice(5),
      portados: p.portados,
      sucessoTim: p.sucesso_tim ?? p.portados + p.falha_parcial,
      fechados: p.fechados,
      taxaSucessoTim: p.fechados
        ? Math.round(((p.portados + p.falha_parcial) / p.fechados) * 1000) / 10
        : 0,
      execucoes: p.execucoes,
      bko: p.bko,
    }));
}

export function endpointAcao(acao: string): string {
  return ENDPOINTS[acao] || ENDPOINTS.consult;
}
