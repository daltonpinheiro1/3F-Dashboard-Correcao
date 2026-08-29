import type { Advertencia } from './advertenciasEscala';
import type { EvaPayload } from './evaDash';

export type ColaboradorRef = {
  colaborador_nome?: string | null;
  colaborador_matricula?: string | null;
  colaborador_cpf?: string | null;
  colaborador_cargo?: string | null;
  colaborador_supervisor?: string | null;
};

export type OperadorSugestao = {
  nome: string;
  login?: string;
  matricula?: string;
  cpf?: string;
  cargo?: string;
  supervisor?: string;
  fonte: 'eva' | 'historico' | 'atestado';
};

export function normBusca(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function palavras(s: string): string[] {
  return normBusca(s).split(' ').filter(Boolean);
}

function scoreMatch(op: OperadorSugestao, qn: string): number {
  if (!qn) return 0;
  const nome = normBusca(op.nome);
  const login = normBusca(op.login || '');
  const mat = normBusca(op.matricula || '');
  const sup = normBusca(op.supervisor || '');
  const cpf = String(op.cpf || '').replace(/\D/g, '');

  if (nome === qn || login === qn || mat === qn) return 100;
  if (cpf && qn.replace(/\D/g, '') === cpf) return 100;
  if (nome.startsWith(qn) || login.startsWith(qn) || mat.startsWith(qn)) return 85;
  if (nome.includes(qn)) return 70;
  if (login.includes(qn) || mat.includes(qn)) return 55;
  if (sup.includes(qn)) return 25;

  const nomeTokens = palavras(op.nome);
  const qTokens = palavras(qn);

  if (qTokens.length > 1 && qTokens.every((t) => nome.includes(t))) return 75;

  if (qTokens.length >= 1) {
    const matched = qTokens.filter((qt) =>
      nomeTokens.some((nw) => nw.startsWith(qt) || nw.includes(qt) || (qt.length >= 3 && qt.startsWith(nw.slice(0, 3)))),
    );
    if (matched.length === qTokens.length) return 68;
    if (matched.length > 0) return 45 + matched.length * 8;
  }

  return 0;
}

/** Catálogo unificado: EVA (jornada + ranking) + advertências + atestados. */
export function buildOperadoresCatalog(
  eva: EvaPayload | null | undefined,
  hist: Advertencia[],
  extras: ColaboradorRef[] = [],
): OperadorSugestao[] {
  const byKey = new Map<string, OperadorSugestao>();

  const upsert = (row: OperadorSugestao) => {
    const key =
      normBusca(row.matricula || '') ||
      normBusca(row.login || '') ||
      normBusca(row.nome);
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      return;
    }
    byKey.set(key, {
      nome: prev.nome.length >= row.nome.length ? prev.nome : row.nome,
      login: prev.login || row.login,
      matricula: prev.matricula || row.matricula || prev.login || row.login,
      cpf: prev.cpf || row.cpf,
      cargo: prev.cargo || row.cargo || 'Operador',
      supervisor: prev.supervisor || row.supervisor,
      fonte:
        prev.fonte === 'historico' || row.fonte === 'historico'
          ? 'historico'
          : prev.fonte === 'atestado' || row.fonte === 'atestado'
            ? 'atestado'
            : 'eva',
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

  for (const r of extras) {
    if (!r.colaborador_nome?.trim()) continue;
    upsert({
      nome: r.colaborador_nome.trim(),
      matricula: r.colaborador_matricula || undefined,
      cpf: r.colaborador_cpf || undefined,
      cargo: r.colaborador_cargo || undefined,
      supervisor: r.colaborador_supervisor || undefined,
      fonte: 'atestado',
    });
  }

  const evaRows: Array<{ nome: string; login?: string; supervisor?: string }> = [
    ...(eva?.ranking_operadores || []).map((o) => ({
      nome: o.operador,
      login: o.login,
      supervisor: o.supervisor,
    })),
    ...(eva?.ofensores_tab || []).map((o) => ({
      nome: o.operador || o.nome,
      login: o.login,
      supervisor: o.supervisor,
    })),
    ...(eva?.jornada || []).map((j) => ({
      nome: String(j.user_name || '').trim(),
      login: j.login || undefined,
      supervisor: j.supervisor_name || undefined,
    })),
    ...(eva?.ativas || []).map((a) => ({
      nome: String(a.user_name || '').trim(),
      login: a.login || undefined,
      supervisor: a.supervisor_name || undefined,
    })),
    ...(eva?.hora_operador || []).map((h) => ({
      nome: h.operador,
      login: h.login,
      supervisor: h.supervisor,
    })),
  ];

  for (const o of evaRows) {
    const nome = String(o.nome || '').trim();
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
  const scored = catalog
    .map((op) => ({ op, score: scoreMatch(op, qn) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.op.nome.localeCompare(b.op.nome, 'pt-BR'));

  const seen = new Set<string>();
  const out: OperadorSugestao[] = [];
  for (const { op } of scored) {
    const k = normBusca(op.nome);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(op);
    if (out.length >= limit) break;
  }
  return out;
}
