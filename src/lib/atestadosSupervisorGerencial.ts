import type { Atestado } from './atestadosEscala';
import { diasEfetivos } from './atestadosDuplicidade';
import type { EvaPayload } from './evaDash';

function normNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normSup(s: string): string {
  return normNome(s).replace(/\b(sup|supervisor)\b/gi, '').trim();
}

/** Mapa login/nome → supervisor (EVA live ou histórico do dia). */
export function buildMapaOperadorSupervisor(eva: EvaPayload | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const put = (login: string | null | undefined, nome: string | null | undefined, sup: string) => {
    const s = sup.trim();
    if (!s) return;
    if (login) map.set(`login:${login.trim().toLowerCase()}`, s);
    if (nome) map.set(`nome:${normNome(nome)}`, s);
  };

  for (const j of eva?.jornada || []) {
    put(j.login, j.user_name, j.supervisor_name || '');
  }
  for (const o of eva?.hora_operador || []) {
    put(o.login, o.operador, o.supervisor || '');
  }
  for (const o of eva?.ranking_operadores || []) {
    put(o.login, o.operador, o.supervisor || '');
  }
  return map;
}

export function supervisorDoColaborador(a: Atestado, mapa: Map<string, string>): string {
  const stored = String(a.colaborador_supervisor || '').trim();
  if (stored) return stored;

  const login = String(a.colaborador_matricula || '').trim().toLowerCase();
  if (login && mapa.has(`login:${login}`)) return mapa.get(`login:${login}`)!;

  const nome = normNome(a.colaborador_nome || '');
  if (nome && mapa.has(`nome:${nome}`)) return mapa.get(`nome:${nome}`)!;

  for (const [k, sup] of mapa) {
    if (!k.startsWith('nome:')) continue;
    const n = k.slice(5);
    if (n && nome && (n.includes(nome) || nome.includes(n))) return sup;
  }
  return 'Sem supervisor (EVA)';
}

export type SupervisorAtestadoResumo = {
  supervisor: string;
  total: number;
  pendentes: number;
  aprovados: number;
  dias: number;
  colaboradores: number;
};

export function agregarPorSupervisor(
  rows: Atestado[],
  mapa: Map<string, string>,
): SupervisorAtestadoResumo[] {
  const acc = new Map<
    string,
    { total: number; pendentes: number; aprovados: number; dias: number; colabs: Set<string> }
  >();

  for (const r of rows) {
    const sup = supervisorDoColaborador(r, mapa);
    const slot = acc.get(sup) || {
      total: 0,
      pendentes: 0,
      aprovados: 0,
      dias: 0,
      colabs: new Set<string>(),
    };
    slot.total++;
    if (r.status === 'protocolado' || r.status === 'em_analise') slot.pendentes++;
    if (r.status === 'aprovado' || r.status === 'arquivado') slot.aprovados++;
    if (r.unidade_periodo !== 'horas') slot.dias += Number(r.quantidade_dias) || diasEfetivos(r);
    slot.colabs.add(r.colaborador_matricula || r.colaborador_nome);
    acc.set(sup, slot);
  }

  return [...acc.entries()]
    .map(([supervisor, s]) => ({
      supervisor,
      total: s.total,
      pendentes: s.pendentes,
      aprovados: s.aprovados,
      dias: s.dias,
      colaboradores: s.colabs.size,
    }))
    .sort((a, b) => b.total - a.total || b.dias - a.dias);
}

/** Visão do supervisor logado (solicitações próprias). */
export type ResumoSupervisorLogado = {
  total: number;
  pendentes: number;
  aprovados: number;
  recusados: number;
  recentes: Atestado[];
};

export function resumoSupervisorLogado(
  rows: Atestado[],
  userEmail: string,
  _userName?: string,
): ResumoSupervisorLogado {
  const email = userEmail.trim().toLowerCase();
  const mine = rows.filter((r) => {
    if (r.criado_por_email?.trim().toLowerCase() === email) return true;
    if (r.origem === 'supervisor' && email && r.criado_por_email?.toLowerCase() === email) return true;
    return false;
  });
  const filtered = mine;
  return {
    total: filtered.length,
    pendentes: filtered.filter((r) => r.status === 'protocolado' || r.status === 'em_analise').length,
    aprovados: filtered.filter((r) => r.status === 'aprovado' || r.status === 'arquivado').length,
    recusados: filtered.filter((r) => r.status === 'recusado').length,
    recentes: [...filtered]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 8),
  };
}

export function supervisorNomeMatch(a: string, b: string): boolean {
  const na = normSup(a);
  const nb = normSup(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
