import { fetchEvaDia, type CampanhaOp } from './evaDash';
import { diasDoMesAte } from './brt';
import {
  janelaComparativo,
  montarComparativo,
  pontoDePayload,
  type RrCmpPonto,
  type RrComparativo,
} from './rrComparativos';

const TTL = 120_000;
let cache: { key: string; exp: number; data: RrComparativo } | null = null;

async function mapPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const chunk = await Promise.all(items.slice(i, i + n).map(fn));
    out.push(...chunk);
  }
  return out;
}

export async function fetchRrComparativos(opts: {
  dataRef: string;
  campanha: CampanhaOp;
  hoje: RrCmpPonto;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<RrComparativo> {
  const key = `${opts.dataRef}|${opts.campanha}`;
  if (!opts.force && cache && cache.key === key && Date.now() < cache.exp) return cache.data;

  const janela = janelaComparativo(opts.dataRef);
  const mesDias = diasDoMesAte(opts.dataRef).filter((d) => d !== opts.dataRef);
  const sparkDias = janela.spark.filter((d) => d !== opts.dataRef);
  const extra = [...new Set([...mesDias, janela.d1, janela.d7, ...sparkDias])];

  const loaded = await mapPool(extra, 5, async (dia) => {
    if (opts.signal?.aborted) return { dia, p: null };
    const p = await fetchEvaDia(dia, opts.signal);
    return { dia, p };
  });
  const byDia = new Map(loaded.map((x) => [x.dia, x.p]));

  const ponto = (dia: string): RrCmpPonto | null => {
    const p = byDia.get(dia);
    if (p === undefined) return null;
    return pontoDePayload(dia, p, opts.campanha);
  };

  const spark: RrCmpPonto[] = janela.spark.map((d) =>
    d === opts.dataRef ? opts.hoje : ponto(d) || { dia: d, vendas: 0, cpcPct: 0 },
  );
  const mtdVendas =
    opts.hoje.vendas + mesDias.reduce((s, d) => s + (ponto(d)?.vendas || 0), 0);

  const data = montarComparativo({
    hoje: opts.hoje,
    d1: ponto(janela.d1),
    d7: ponto(janela.d7),
    spark,
    mtdVendas,
  });
  cache = { key, exp: Date.now() + TTL, data };
  return data;
}
