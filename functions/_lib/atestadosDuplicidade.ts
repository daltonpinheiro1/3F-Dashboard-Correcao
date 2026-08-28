/** Detecção de sobreposição de períodos e duplicata por hash. */

export type PeriodoRef = {
  data_inicio?: string | null;
  data_fim?: string | null;
  quantidade_dias?: number | null;
  unidade_periodo?: string | null;
};

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(`${s.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

export function resolverFim(p: PeriodoRef): number | null {
  const ini = parseDate(p.data_inicio);
  if (ini == null) return null;
  const fimExplicit = parseDate(p.data_fim);
  if (fimExplicit != null) return fimExplicit;
  const dias = Number(p.quantidade_dias) || 0;
  if (p.unidade_periodo === 'dias' && dias > 0) {
    return ini + (Math.ceil(dias) - 1) * 86_400_000;
  }
  return ini;
}

export function periodosSobrepoem(a: PeriodoRef, b: PeriodoRef): boolean {
  const aIni = parseDate(a.data_inicio);
  const bIni = parseDate(b.data_inicio);
  if (aIni == null || bIni == null) return false;
  const aFim = resolverFim(a) ?? aIni;
  const bFim = resolverFim(b) ?? bIni;
  return aIni <= bFim && bIni <= aFim;
}

export function mesmoColaborador(
  a: { colaborador_matricula?: string | null; colaborador_nome?: string | null },
  b: { colaborador_matricula?: string | null; colaborador_nome?: string | null },
): boolean {
  const matA = String(a.colaborador_matricula || '').trim();
  const matB = String(b.colaborador_matricula || '').trim();
  if (matA && matB && matA === matB) return true;
  const nomeA = String(a.colaborador_nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const nomeB = String(b.colaborador_nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return nomeA.length >= 3 && nomeA === nomeB;
}

export function findSobreposicoes<
  T extends PeriodoRef & {
    id?: string;
    protocolo?: string;
    status?: string;
    colaborador_matricula?: string | null;
    colaborador_nome?: string | null;
  },
>(existentes: T[], novo: T): T[] {
  const ativos = existentes.filter(
    (e) => !['recusado', 'cancelada'].includes(String(e.status || '')),
  );
  return ativos.filter(
    (e) => e.id !== novo.id && mesmoColaborador(e, novo) && periodosSobrepoem(e, novo),
  );
}

export const INSS_DIAS_LIMIAR = 15;

export function diasEfetivos(p: PeriodoRef): number {
  const ini = parseDate(p.data_inicio);
  const fim = resolverFim(p);
  if (ini != null && fim != null) {
    return Math.max(1, Math.round((fim - ini) / 86_400_000) + 1);
  }
  if (p.unidade_periodo === 'dias') return Number(p.quantidade_dias) || 0;
  return 0;
}

export function requerAlertaInss(p: PeriodoRef): boolean {
  return diasEfetivos(p) > INSS_DIAS_LIMIAR;
}
