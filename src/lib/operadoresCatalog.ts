import type { Advertencia } from './advertenciasEscala';
import type { EvaPayload } from './evaDash';

export type OperadorSugestao = {
  nome: string;
  login?: string;
  matricula?: string;
  cpf?: string;
  cargo?: string;
  supervisor?: string;
  fonte: 'eva' | 'historico';
};

export function normBusca(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function scoreMatch(op: OperadorSugestao, qn: string): number {
  if (!qn) return 0;
  const nome = normBusca(op.nome);
  const login = normBusca(op.login || '');
  const mat = normBusca(op.matricula || '');
  const sup = normBusca(op.supervisor || '');
  if (nome === qn || login === qn || mat === qn) return 100;
  if (nome.startsWith(qn) || login.startsWith(qn) || mat.startsWith(qn)) return 80;
  if (nome.includes(qn)) return 60;
  if (login.includes(qn) || mat.includes(qn)) return 50;
  if (sup.includes(qn)) return 20;
  // tokens
  const tokens = qn.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => nome.includes(t))) return 70;
  return 0;
}

/** Catálogo unificado: EVA live + histórico de advertências (CPF/cargo/matrícula). */
export function buildOperadoresCatalog(
  eva: EvaPayload | null | undefined,
  hist: Advertencia[],
): OperadorSugestao[] {
  const byKey = new Map<string, OperadorSugestao>();

  const upsert = (row: OperadorSugestao) => {
    const key = normBusca(row.nome) || normBusca(row.login || '') || normBusca(row.matricula || '');
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      return;
    }
    byKey.set(key, {
      nome: prev.nome || row.nome,
      login: prev.login || row.login,
      matricula: prev.matricula || row.matricula || prev.login || row.login,
      cpf: prev.cpf || row.cpf,
      cargo: prev.cargo || row.cargo || 'Operador',
      supervisor: prev.supervisor || row.supervisor,
      fonte: prev.fonte === 'historico' || row.fonte === 'historico' ? 'historico' : 'eva',
    });
  };

  for (const r of hist) {
    if (!r.colaborador_nome?.trim()) continue;
    upsert({
      nome: r.colaborador_nome.trim(),
      matricula: r.colaborador_matricula || undefined,
      cpf: r.colaborador_cpf || undefined,
      cargo: r.colaborador_cargo || undefined,
      fonte: 'historico',
    });
  }

  const ops = [
    ...(eva?.ranking_operadores || []),
    ...(eva?.ofensores_tab || []).map((o) => ({
      login: o.login,
      operador: o.operador || o.nome,
      supervisor: o.supervisor,
    })),
  ];
  for (const o of ops) {
    const nome = String(o.operador || '').trim();
    if (!nome) continue;
    upsert({
      nome,
      login: o.login || undefined,
      matricula: o.login || undefined,
      cargo: 'Operador',
      supervisor: o.supervisor || undefined,
      fonte: 'eva',
    });
  }

  return [...byKey.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filtrarOperadores(
  catalog: OperadorSugestao[],
  query: string,
  limit = 12,
): OperadorSugestao[] {
  const qn = normBusca(query);
  if (qn.length < 2) return [];
  return catalog
    .map((op) => ({ op, score: scoreMatch(op, qn) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.op.nome.localeCompare(b.op.nome, 'pt-BR'))
    .slice(0, limit)
    .map((x) => x.op);
}
