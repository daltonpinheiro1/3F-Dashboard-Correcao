import type { EvaJornada } from './evaDash';

export type OciosidadeOp = {
  nome: string;
  supervisor: string;
  espera: number;
  /** Em atendimento (working_time). */
  falando: number;
  /** Pós-tabulação. */
  tabulando: number;
  /** Discando. */
  discando: number;
  base: number;
  logado: number;
  chamadas: number;
  intervaloMedio: number;
  pct: number;
  /** null enquanto o sync ainda não trouxe a contagem de vãos. */
  vales: number | null;
};

export type OciosidadeSup = {
  supervisor: string;
  operadores: number;
  espera: number;
  falando: number;
  tabulando: number;
  discando: number;
  base: number;
  chamadas: number;
  intervaloMedio: number;
  pct: number;
  vales: number | null;
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
  vales: number | null;
  /** Quem teve espera ou vale. A tabela ordena e filtra esta lista. */
  porOperador: OciosidadeOp[];
  ofensores: OciosidadeOp[];
  porSupervisor: OciosidadeSup[];
};

function n(value: unknown): number {
  const v = Number(value);
  return Number.isFinite(v) && v > 0 ? v : 0;
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
  vales: null,
  porOperador: [],
  ofensores: [],
  porSupervisor: [],
};

/**
 * Ociosidade = vão entre ligações, somando cada jornada (não é único por operador).
 * Pausa e o buraco de relogin saem da base. A espera não pode passar do que sobra
 * depois de atendimento, pós-tabulação, pausa e deslogue.
 * O percentual do time é soma(espera) / soma(base), ponderado pelo tempo útil.
 * A média é soma(espera) / soma(atendimentos). Vales > 45s vêm do sync, somados
 * por jornada (cada campanha conta os vãos da ligação seguinte).
 */
export function medirOciosidade(rows: EvaJornada[]): OciosidadeResumo {
  const porOp = new Map<string, {
    login: string;
    nome: string;
    supervisor: string;
    espera: number;
    falando: number;
    tabulando: number;
    discando: number;
    pausa: number;
    relogin: number;
    base: number;
    logado: number;
    chamadas: number;
    tabuladas: number;
    sucesso: number;
    tmaNum: number;
    tmaDen: number;
    vales: number;
    viuVales: boolean;
  }>();

  let viuEstado = false;
  type Fatia = {
    login: string;
    dia: string;
    idUser: string;
    campanha: string;
    nome: string;
    supervisor: string;
    logado: number;
    pausa: number;
    relogin: number;
    falando: number;
    tabulando: number;
    discando: number;
    disponivel: number;
    chamadas: number;
    tabuladas: number;
    sucesso: number;
    tma: number;
    vales: number;
    viuVales: boolean;
  };
  const fatias: Fatia[] = [];
  for (const row of rows) {
    const login = String(row.login || row.id_user || '').trim();
    if (!login) continue;
    const dia = String(row.date_report || row.date_login || '').slice(0, 10);
    const disponivel = n(row.available_time);
    if (row.available_time != null || row.working_time != null || row.classifying_time != null) viuEstado = true;
    const chamadas = n(row.chamadas) || n(row.tabuladas);
    const tma = n(row.tma_seg);
    fatias.push({
      login,
      dia,
      idUser: String(row.id_user ?? ''),
      campanha: String(row.campanha_op || row.campaign_name || ''),
      nome: row.user_name || login,
      supervisor: row.supervisor_name || 'Sem supervisor',
      logado: n(row.logged_time),
      pausa: n(row.pausa_seg) || n(row.paused_time),
      relogin: n(row.tempo_perdido_seg),
      falando: n(row.working_time),
      tabulando: n(row.classifying_time),
      discando: n(row.dialing_time),
      disponivel,
      chamadas,
      tabuladas: n(row.tabuladas),
      sucesso: n(row.sucesso),
      tma,
      vales: row.vales_45 != null && Number.isFinite(Number(row.vales_45)) ? Math.max(0, Number(row.vales_45)) : 0,
      viuVales: row.vales_45 != null && Number.isFinite(Number(row.vales_45)),
    });
  }

  const grupos = new Map<string, Fatia[]>();
  for (const f of fatias) {
    const gk = `${f.login}|${f.dia}|${f.idUser}`;
    const arr = grupos.get(gk) || [];
    arr.push(f);
    grupos.set(gk, arr);
  }

  for (const grupo of grupos.values()) {
    const primeiro = grupo[0];
    const logados = new Set(grupo.map((f) => f.logado));
    // O sync grava pausa, relogin e chamadas do dia inteiro em cada campanha.
    // Só deduz uma vez quando as fatias têm tempos logados diferentes e esses totais iguais.
    const totalRepetido = grupo.length > 1
      && logados.size > 1
      && grupo.every((f) => f.pausa === primeiro.pausa && f.relogin === primeiro.relogin && f.chamadas === primeiro.chamadas);
    const pausaG = totalRepetido ? primeiro.pausa : grupo.reduce((s, f) => s + f.pausa, 0);
    const reloginG = totalRepetido ? primeiro.relogin : grupo.reduce((s, f) => s + f.relogin, 0);
    const chamadasG = totalRepetido ? primeiro.chamadas : grupo.reduce((s, f) => s + f.chamadas, 0);
    const logadoG = grupo.reduce((s, f) => s + f.logado, 0);
    const ocupadoG = grupo.reduce((s, f) => s + f.falando + f.tabulando + f.discando, 0);
    const disponivelG = grupo.reduce((s, f) => s + f.disponivel, 0);
    const baseG = Math.max(0, logadoG - pausaG - reloginG);
    const tetoG = Math.max(0, baseG - ocupadoG);
    const esperaG = disponivelG > 0 ? Math.min(disponivelG, tetoG) : 0;

    grupo.forEach((f, i) => {
    const chave = `${f.login}|${f.dia}|${f.campanha}|${f.idUser}`;
    const logado = f.logado;
    const pausa = totalRepetido ? (i === 0 ? pausaG : 0) : f.pausa;
    const relogin = totalRepetido ? (i === 0 ? reloginG : 0) : f.relogin;
    const base = totalRepetido ? (i === 0 ? baseG : 0) : Math.max(0, f.logado - f.pausa - f.relogin);
    const ocupado = f.falando + f.tabulando + f.discando;
    const teto = totalRepetido ? tetoG : Math.max(0, base - ocupado);
    const disponivel = f.disponivel;
    const espera = totalRepetido
      ? (disponivelG > 0 ? esperaG * (f.disponivel / disponivelG) : 0)
      : (disponivel > 0 ? Math.min(disponivel, teto) : 0);
    const chamadas = totalRepetido ? (i === 0 ? chamadasG : 0) : f.chamadas;
    const slot = porOp.get(chave) || {
      login: f.login,
      nome: f.nome,
      supervisor: f.supervisor,
      espera: 0,
      falando: 0,
      tabulando: 0,
      discando: 0,
      pausa: 0,
      relogin: 0,
      base: 0,
      logado: 0,
      chamadas: 0,
      tabuladas: 0,
      sucesso: 0,
      tmaNum: 0,
      tmaDen: 0,
      vales: 0,
      viuVales: false,
    };
    slot.espera += espera;
    slot.falando += f.falando;
    slot.tabulando += f.tabulando;
    slot.discando += f.discando;
    slot.pausa += pausa;
    slot.relogin += relogin;
    slot.base += base;
    slot.logado += logado;
    slot.chamadas += chamadas;
    slot.tabuladas += f.tabuladas;
    slot.sucesso += f.sucesso;
    if (f.tma > 0 && chamadas > 0) {
      slot.tmaNum += f.tma * chamadas;
      slot.tmaDen += chamadas;
    }
    if (f.viuVales) {
      slot.viuVales = true;
      slot.vales += f.vales;
    }
    porOp.set(chave, slot);
    });
  }

  const pessoas = new Map<string, OciosidadeOp & { tmaNum: number; tmaDen: number; tabuladas: number; sucesso: number; viuVales: boolean }>();
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
      falando: 0,
      tabulando: 0,
      discando: 0,
      base: 0,
      logado: 0,
      chamadas: 0,
      intervaloMedio: 0,
      pct: 0,
      vales: 0,
      tmaNum: 0,
      tmaDen: 0,
      tabuladas: 0,
      sucesso: 0,
      viuVales: false,
    };
    prev.espera += slot.espera;
    prev.falando += slot.falando;
    prev.tabulando += slot.tabulando;
    prev.discando += slot.discando;
    prev.base += slot.base;
    prev.logado += slot.logado;
    prev.chamadas += slot.chamadas;
    prev.tmaNum += slot.tmaNum;
    prev.tmaDen += slot.tmaDen;
    prev.tabuladas += slot.tabuladas;
    prev.sucesso += slot.sucesso;
    prev.vales = (prev.vales || 0) + slot.vales;
    prev.viuVales = prev.viuVales || slot.viuVales;
    pessoas.set(pessoaChave, prev);
  }

  const ops: OciosidadeOp[] = [...pessoas.values()].map((slot) => {
    return {
      nome: slot.nome,
      supervisor: slot.supervisor,
      espera: slot.espera,
      falando: slot.falando,
      tabulando: slot.tabulando,
      discando: slot.discando,
      base: slot.base,
      logado: slot.logado,
      chamadas: slot.chamadas,
      intervaloMedio: slot.chamadas > 0 ? slot.espera / slot.chamadas : 0,
      pct: slot.base > 0 ? (100 * slot.espera) / slot.base : 0,
      vales: slot.viuVales ? slot.vales || 0 : null,
    };
  });

  if (!ops.length) return VAZIO;
  const espera = ops.reduce((s, o) => s + o.espera, 0);
  const chamadas = ops.reduce((s, o) => s + o.chamadas, 0);
  const base = ops.reduce((s, o) => s + o.base, 0);
  const logado = ops.reduce((s, o) => s + o.logado, 0);
  const viuVales = ops.some((o) => o.vales != null);
  const vales = viuVales ? ops.reduce((s, o) => s + (o.vales || 0), 0) : null;
  const porSup = new Map<string, OciosidadeSup & { viuVales: boolean }>();
  for (const o of ops) {
    const prev = porSup.get(o.supervisor) || {
      supervisor: o.supervisor,
      operadores: 0,
      espera: 0,
      falando: 0,
      tabulando: 0,
      discando: 0,
      base: 0,
      chamadas: 0,
      intervaloMedio: 0,
      pct: 0,
      vales: 0,
      viuVales: false,
    };
    prev.operadores += 1;
    prev.espera += o.espera;
    prev.falando += o.falando;
    prev.tabulando += o.tabulando;
    prev.discando += o.discando;
    prev.base += o.base;
    prev.chamadas += o.chamadas;
    if (o.vales != null) {
      prev.viuVales = true;
      prev.vales = (prev.vales || 0) + o.vales;
    }
    porSup.set(o.supervisor, prev);
  }
  const porSupervisor: OciosidadeSup[] = [...porSup.values()]
    .map((s) => ({
      supervisor: s.supervisor,
      operadores: s.operadores,
      espera: s.espera,
      falando: s.falando,
      tabulando: s.tabulando,
      discando: s.discando,
      base: s.base,
      chamadas: s.chamadas,
      intervaloMedio: s.chamadas > 0 ? s.espera / s.chamadas : 0,
      pct: s.base > 0 ? (100 * s.espera) / s.base : 0,
      vales: s.viuVales ? s.vales || 0 : null,
    }))
    .sort((a, b) => b.intervaloMedio - a.intervaloMedio || b.espera - a.espera);
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
    vales,
    porOperador: ops
      .filter((o) => o.espera > 0 || (o.vales != null && o.vales > 0))
      .sort((a, b) => (b.vales || 0) - (a.vales || 0) || b.espera - a.espera),
    ofensores: ops
      .filter((o) => (o.vales != null && o.vales > 0) || (o.base >= 1800 && o.espera > 0))
      .sort((a, b) => (b.vales || 0) - (a.vales || 0) || b.pct - a.pct)
      .slice(0, 8),
    porSupervisor,
  };
}

/** Hora '09' a partir de 9, '09' ou '09:10'. Hora ausente volta vazia. */
export function horaChave(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const txt = String(raw).trim();
  const head = txt.includes(':') ? txt.slice(0, 2) : txt;
  if (!/^\d{1,2}$/.test(head)) return '';
  const hora = Number(head);
  if (hora < 0 || hora > 23) return '';
  return String(hora).padStart(2, '0');
}

/** Espera da hora do próprio slot. Não lê variável de laço anterior. */
export function esperaNoSlot(slot: string, porHora: Map<string, number>): number | null {
  const hh = horaChave(slot.slice(0, 2));
  if (!hh || !porHora.has(hh)) return null;
  return porHora.get(hh) as number;
}
