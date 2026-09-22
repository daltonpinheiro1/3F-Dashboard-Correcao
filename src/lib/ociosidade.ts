import type { EvaJornada } from './evaDash';

export type OciosidadeOp = {
  nome: string;
  supervisor: string;
  espera: number;
  base: number;
  logado: number;
  chamadas: number;
  intervaloMedio: number;
  pct: number;
  chamadasPerdidas: number;
  vendasPerdidas: number;
};

export type OciosidadeResumo = {
  medido: boolean;
  operadores: number;
  espera: number;
  falando: number;
  tabulando: number;
  pausa: number;
  relogin: number;
  base: number;
  logado: number;
  chamadas: number;
  intervaloMedio: number;
  pct: number;
  chamadasPerdidas: number;
  vendasPerdidas: number;
  ofensores: OciosidadeOp[];
};

function n(value: unknown): number {
  const v = Number(value);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const VAZIO: OciosidadeResumo = {
  medido: false,
  operadores: 0,
  espera: 0,
  falando: 0,
  tabulando: 0,
  pausa: 0,
  relogin: 0,
  base: 0,
  logado: 0,
  chamadas: 0,
  intervaloMedio: 0,
  pct: 0,
  chamadasPerdidas: 0,
  vendasPerdidas: 0,
  ofensores: [],
};

/**
 * Ociosidade = vão entre ligações, somando cada jornada (não é único por operador).
 * Pausa e o buraco de relogin saem da base. A espera não pode passar do que sobra
 * depois de atendimento, pós-tabulação, pausa e deslogue.
 * O percentual do time é soma(espera) / soma(base), ponderado pelo tempo útil.
 */
export function medirOciosidade(rows: EvaJornada[]): OciosidadeResumo {
  const porOp = new Map<string, {
    login: string;
    nome: string;
    supervisor: string;
    espera: number;
    falando: number;
    tabulando: number;
    pausa: number;
    relogin: number;
    base: number;
    logado: number;
    chamadas: number;
    tabuladas: number;
    sucesso: number;
    tmaNum: number;
    tmaDen: number;
  }>();

  let viuEstado = false;
  for (const row of rows) {
    const login = String(row.login || row.id_user || '').trim();
    if (!login) continue;
    const dia = String(row.date_report || row.date_login || '').slice(0, 10);
    const chave = `${login}|${dia}|${row.campanha_op || row.campaign_name || ''}|${row.id_user}`;
    const logado = n(row.logged_time);
    const pausa = n(row.pausa_seg) || n(row.paused_time);
    const relogin = n(row.tempo_perdido_seg);
    const falando = n(row.working_time);
    const tabulando = n(row.classifying_time);
    const discando = n(row.dialing_time);
    const base = Math.max(0, logado - pausa - relogin);
    const ocupado = falando + tabulando + discando;
    const teto = Math.max(0, base - ocupado);
    const disponivel = n(row.available_time);
    if (row.available_time != null || row.working_time != null || row.classifying_time != null) viuEstado = true;
    const espera = disponivel > 0 ? Math.min(disponivel, teto) : 0;
    const chamadas = n(row.chamadas) || n(row.tabuladas);
    const slot = porOp.get(chave) || {
      login,
      nome: row.user_name || login,
      supervisor: row.supervisor_name || '—',
      espera: 0,
      falando: 0,
      tabulando: 0,
      pausa: 0,
      relogin: 0,
      base: 0,
      logado: 0,
      chamadas: 0,
      tabuladas: 0,
      sucesso: 0,
      tmaNum: 0,
      tmaDen: 0,
    };
    slot.espera += espera;
    slot.falando += falando;
    slot.tabulando += tabulando;
    slot.pausa += pausa;
    slot.relogin += relogin;
    slot.base += base;
    slot.logado += logado;
    slot.chamadas += chamadas;
    slot.tabuladas += n(row.tabuladas);
    slot.sucesso += n(row.sucesso);
    const tma = n(row.tma_seg);
    if (tma > 0 && chamadas > 0) {
      slot.tmaNum += tma * chamadas;
      slot.tmaDen += chamadas;
    }
    porOp.set(chave, slot);
  }

  const pessoas = new Map<string, OciosidadeOp & { tmaNum: number; tmaDen: number; tabuladas: number; sucesso: number }>();
  let falando = 0;
  let tabulando = 0;
  let pausa = 0;
  let relogin = 0;
  for (const slot of porOp.values()) {
    if (slot.logado <= 0 && slot.espera <= 0 && slot.falando <= 0) continue;
    falando += slot.falando;
    tabulando += slot.tabulando;
    pausa += slot.pausa;
    relogin += slot.relogin;
    const pessoaChave = slot.login;
    const prev = pessoas.get(pessoaChave) || {
      nome: slot.nome,
      supervisor: slot.supervisor,
      espera: 0,
      base: 0,
      logado: 0,
      chamadas: 0,
      intervaloMedio: 0,
      pct: 0,
      chamadasPerdidas: 0,
      vendasPerdidas: 0,
      tmaNum: 0,
      tmaDen: 0,
      tabuladas: 0,
      sucesso: 0,
    };
    prev.espera += slot.espera;
    prev.base += slot.base;
    prev.logado += slot.logado;
    prev.chamadas += slot.chamadas;
    prev.tmaNum += slot.tmaNum;
    prev.tmaDen += slot.tmaDen;
    prev.tabuladas += slot.tabuladas;
    prev.sucesso += slot.sucesso;
    pessoas.set(pessoaChave, prev);
  }

  const ops: OciosidadeOp[] = [...pessoas.values()].map((slot) => {
    const tma = slot.tmaDen > 0 ? slot.tmaNum / slot.tmaDen : 0;
    const chamadasPerdidas = tma > 0 ? slot.espera / tma : 0;
    const conv = slot.tabuladas > 0 ? slot.sucesso / slot.tabuladas : 0;
    return {
      nome: slot.nome,
      supervisor: slot.supervisor,
      espera: slot.espera,
      base: slot.base,
      logado: slot.logado,
      chamadas: slot.chamadas,
      intervaloMedio: slot.chamadas > 0 ? slot.espera / slot.chamadas : 0,
      pct: slot.base > 0 ? (100 * slot.espera) / slot.base : 0,
      chamadasPerdidas,
      vendasPerdidas: chamadasPerdidas * conv,
    };
  });

  if (!ops.length) return VAZIO;
  const espera = ops.reduce((s, o) => s + o.espera, 0);
  const chamadas = ops.reduce((s, o) => s + o.chamadas, 0);
  const base = ops.reduce((s, o) => s + o.base, 0);
  const logado = ops.reduce((s, o) => s + o.logado, 0);
  return {
    medido: viuEstado,
    operadores: ops.length,
    espera,
    falando,
    tabulando,
    pausa,
    relogin,
    base,
    logado,
    chamadas,
    intervaloMedio: chamadas > 0 ? espera / chamadas : 0,
    pct: base > 0 ? (100 * espera) / base : 0,
    chamadasPerdidas: round1(ops.reduce((s, o) => s + o.chamadasPerdidas, 0)),
    vendasPerdidas: round1(ops.reduce((s, o) => s + o.vendasPerdidas, 0)),
    ofensores: ops
      .filter((o) => o.base >= 1800 && o.espera > 0)
      .sort((a, b) => b.vendasPerdidas - a.vendasPerdidas || b.pct - a.pct)
      .slice(0, 8),
  };
}
