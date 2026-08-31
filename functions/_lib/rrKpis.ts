/**
 * Agregação RR 360 no Pages Function (service role).
 * Espelho das regras de smsRules / erroClassification / rr360 — não importar src/.
 */

const TICKETS_SUCESSO = new Set([
  'portado',
  'falha parcial',
  'antigo',
  'ativado',
  'activated',
  'ativo',
  'ativa',
]);

const TIPOS_NAO_ERRO = new Set(['referencia_tratamento', 'logradouro_acentuacao']);

export function isPortadoConsolidado(row: {
  classificacao?: string | null;
  ticket_status?: string | null;
}): boolean {
  if ((row.classificacao || '').trim().toLowerCase() === 'sucesso') return true;
  return TICKETS_SUCESSO.has((row.ticket_status || '').trim().toLowerCase());
}

export function temErroOperacional(tipos: string[] | null | undefined): boolean {
  return (tipos || []).some((t) => t && !TIPOS_NAO_ERRO.has(t));
}

export function dedupePorProposta<T extends { proposta_id?: string | null }>(
  rows: T[],
  pick: (prev: T, next: T) => T,
): T[] {
  const named = new Map<string, T>();
  const unnamed: T[] = [];
  for (const row of rows) {
    const pid = String(row.proposta_id || '').trim();
    if (!pid) {
      unnamed.push(row);
      continue;
    }
    const prev = named.get(pid);
    named.set(pid, prev ? pick(prev, row) : row);
  }
  return [...named.values(), ...unnamed];
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function agregarSmsDia(rows: Array<{
  proposta_id?: string | null;
  classificacao?: string | null;
  ticket_status?: string | null;
}>) {
  const uniq = dedupePorProposta(rows, (a, b) => (isPortadoConsolidado(b) ? b : a));
  const vendasBrutas = uniq.length;
  const portadosConsolidado = uniq.filter(isPortadoConsolidado).length;
  return {
    vendasBrutas,
    portadosConsolidado,
    pctPortadosGross: pct(portadosConsolidado, vendasBrutas),
  };
}

export function agregarErroDia(rows: Array<{ tipos_erro?: string[] | null }>) {
  const propostas = rows.length;
  const comErro = rows.filter((r) => temErroOperacional(r.tipos_erro)).length;
  return { propostas, comErro, taxaErroPct: pct(comErro, propostas) };
}

export type RrListaItem = {
  proposta_id: string;
  classificacao: string | null;
  ticket_status: string | null;
  vendedor: string | null;
  tipos_erro?: string[] | null;
};

const LISTA_CAP = 80;

export function listaGrossDia(
  rows: Array<{
    proposta_id?: string | null;
    classificacao?: string | null;
    ticket_status?: string | null;
    vendedor?: string | null;
  }>,
  cap = LISTA_CAP,
): RrListaItem[] {
  const uniq = dedupePorProposta(rows, (a, b) => (isPortadoConsolidado(b) ? b : a));
  return uniq.slice(0, cap).map((r) => ({
    proposta_id: String(r.proposta_id || '—'),
    classificacao: r.classificacao ?? null,
    ticket_status: r.ticket_status ?? null,
    vendedor: r.vendedor ?? null,
  }));
}

export function listaErroDia(
  rows: Array<{
    proposta_id?: string | null;
    vendedor?: string | null;
    tipos_erro?: string[] | null;
  }>,
  cap = LISTA_CAP,
): RrListaItem[] {
  return rows
    .filter((r) => temErroOperacional(r.tipos_erro))
    .slice(0, cap)
    .map((r) => ({
      proposta_id: String(r.proposta_id || '—'),
      classificacao: null,
      ticket_status: null,
      vendedor: r.vendedor ?? null,
      tipos_erro: r.tipos_erro ?? null,
    }));
}

export function startOfBrtDayIso(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return new Date(Date.UTC(num('year'), num('month') - 1, num('day'), 3, 0, 0)).toISOString();
}
