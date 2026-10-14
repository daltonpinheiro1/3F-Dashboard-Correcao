/**
 * Meta de vendas por competência para janelas RR que cruzam meses ou olham mês passado.
 * O store só guarda a competência vigente; meses anteriores vêm de /api/metas?competencia=.
 */
import type { CampanhaOp } from './evaDash';
import { fetchMetas, type MetaCampanhaRow } from './metasApi';
import { shiftIsoDay } from './brt';

export type RrMetasVendas = { port: number; mig: number; campanha: number };

const cache = new Map<string, Promise<MetaCampanhaRow[] | null>>();

export function mesesDaJanela(from: string, to: string): string[] {
  const out: string[] = [];
  const end = to.slice(0, 10);
  let cur = from.slice(0, 10);
  let guard = 0;
  while (cur && cur <= end && guard < 400) {
    const ym = cur.slice(0, 7);
    if (!out.includes(ym)) out.push(ym);
    cur = shiftIsoDay(cur, 1);
    guard += 1;
  }
  return out;
}

function vendasDe(rows: MetaCampanhaRow[], op: string): number | null {
  const r = rows.find((x) => x.campanha_op === op);
  const v = Number(r?.vendas_mes);
  return r && Number.isFinite(v) && v >= 0 ? v : null;
}

/** null = competência sem meta cadastrada para a campanha (Todas exige Port e Mig). */
export function metasVendasDeRows(
  rows: MetaCampanhaRow[] | null | undefined,
  campanha: CampanhaOp,
): RrMetasVendas | null {
  if (!rows?.length) return null;
  const port = vendasDe(rows, 'PORTABILIDADE');
  const mig = vendasDe(rows, 'MIGRACAO');
  const propria = campanha === 'TODAS'
    ? port != null && mig != null
      ? port + mig
      : null
    : vendasDe(rows, campanha);
  if (propria == null) return null;
  return { port: port ?? 0, mig: mig ?? 0, campanha: propria };
}

export function fetchMetasCompetencia(ym: string): Promise<MetaCampanhaRow[] | null> {
  const hit = cache.get(ym);
  if (hit) return hit;
  const p = fetchMetas(ym)
    .then((r) => (r && r.competencia === ym ? r.campanhas : null))
    .catch(() => null);
  cache.set(ym, p);
  void p.then((rows) => {
    if (rows == null) cache.delete(ym);
  });
  return p;
}

/**
 * Resolve a meta mensal por competência: mês vigente usa o store; outros meses usam a meta
 * cadastrada daquele mês. Sem cadastro (null), cai no vigente e o mês entra em `mesesSemMeta`;
 * undefined = ainda carregando.
 */
export function resolverMetasPorMes(opts: {
  mesVigente: string;
  vigente: RrMetasVendas;
  meses: string[];
  porMes: Record<string, RrMetasVendas | null | undefined>;
}): {
  port: (ym: string) => number;
  mig: (ym: string) => number;
  campanha: (ym: string) => number;
  mesesSemMeta: string[];
} {
  const { mesVigente, vigente, porMes } = opts;
  const pick = (ym: string): RrMetasVendas =>
    ym === mesVigente ? vigente : porMes[ym] ?? vigente;
  const mesesSemMeta = opts.meses.filter((ym) => ym !== mesVigente && porMes[ym] === null);
  return {
    port: (ym) => pick(ym).port,
    mig: (ym) => pick(ym).mig,
    campanha: (ym) => pick(ym).campanha,
    mesesSemMeta,
  };
}
