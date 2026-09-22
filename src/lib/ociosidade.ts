import type { EvaJornada } from './evaDash';

export type OciosidadeOp = {
  nome: string;
  supervisor: string;
  espera: number;
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

/**
 * Ociosidade = tempo disponível do EVA entre ligações (available_time).
 * Pausa e atendimento ficam de fora. A perda usa o TMA: espera ÷ TMA = atendimentos que cabiam.
 */
export function medirOciosidade(rows: EvaJornada[]): OciosidadeResumo {
  const vazio: OciosidadeResumo = {
    medido: false,
    operadores: 0,
    espera: 0,
    falando: 0,
    tabulando: 0,
    logado: 0,
    chamadas: 0,
    intervaloMedio: 0,
    pct: 0,
    chamadasPerdidas: 0,
    vendasPerdidas: 0,
    ofensores: [],
  };
  const porOp = new Map<string, {
    nome: string;
    supervisor: string;
    espera: number;
    falando: number;
    tabulando: number;
    logado: number;
    chamadas: number;
    tabuladas: number;
    sucesso: number;
    tmaNum: number;
    tmaDen: number;
    vistos: Set<string>;
  }>();

  for (const row of rows) {
    const login = String(row.login || row.id_user || '').trim();
    if (!login) continue;
    const dia = String(row.date_report || row.date_login || '').slice(0, 10);
    const espera = n(row.available_time);
    const falando = n(row.working_time);
    const tabulando = n(row.classifying_time);
    const logado = n(row.logged_time);
    const chamadas = n(row.chamadas) || n(row.tabuladas);
    const marca = [dia, espera, falando, tabulando, logado, chamadas, n(row.tabuladas)].join('|');
    const slot = porOp.get(login) || {
      nome: row.user_name || login,
      supervisor: row.supervisor_name || '—',
      espera: 0,
      falando: 0,
      tabulando: 0,
      logado: 0,
      chamadas: 0,
      tabuladas: 0,
      sucesso: 0,
      tmaNum: 0,
      tmaDen: 0,
      vistos: new Set<string>(),
    };
    if (slot.vistos.has(marca)) continue;
    slot.vistos.add(marca);
    slot.espera += espera;
    slot.falando += falando;
    slot.tabulando += tabulando;
    slot.logado += logado;
    slot.chamadas += chamadas;
    slot.tabuladas += n(row.tabuladas);
    slot.sucesso += n(row.sucesso);
    const tma = n(row.tma_seg);
    if (tma > 0 && chamadas > 0) {
      slot.tmaNum += tma * chamadas;
      slot.tmaDen += chamadas;
    }
    porOp.set(login, slot);
  }

  const ops: OciosidadeOp[] = [];
  let falando = 0;
  let tabulando = 0;
  for (const slot of porOp.values()) {
    if (slot.espera <= 0 && slot.falando <= 0) continue;
    falando += slot.falando;
    tabulando += slot.tabulando;
    const tma = slot.tmaDen > 0 ? slot.tmaNum / slot.tmaDen : 0;
    const chamadasPerdidas = tma > 0 ? slot.espera / tma : 0;
    const conv = slot.tabuladas > 0 ? slot.sucesso / slot.tabuladas : 0;
    ops.push({
      nome: slot.nome,
      supervisor: slot.supervisor,
      espera: slot.espera,
      logado: slot.logado,
      chamadas: slot.chamadas,
      intervaloMedio: slot.chamadas > 0 ? slot.espera / slot.chamadas : 0,
      pct: slot.logado > 0 ? (100 * slot.espera) / slot.logado : 0,
      chamadasPerdidas,
      vendasPerdidas: chamadasPerdidas * conv,
    });
  }

  if (!ops.length) return vazio;
  const espera = ops.reduce((s, o) => s + o.espera, 0);
  const chamadas = ops.reduce((s, o) => s + o.chamadas, 0);
  const logado = ops.reduce((s, o) => s + o.logado, 0);
  return {
    medido: true,
    operadores: ops.length,
    espera,
    falando,
    tabulando,
    logado,
    chamadas,
    intervaloMedio: chamadas > 0 ? espera / chamadas : 0,
    pct: logado > 0 ? (100 * espera) / logado : 0,
    chamadasPerdidas: round1(ops.reduce((s, o) => s + o.chamadasPerdidas, 0)),
    vendasPerdidas: round1(ops.reduce((s, o) => s + o.vendasPerdidas, 0)),
    ofensores: ops
      .filter((o) => o.logado >= 1800 && o.espera > 0)
      .sort((a, b) => b.vendasPerdidas - a.vendasPerdidas || b.pct - a.pct)
      .slice(0, 8),
  };
}
