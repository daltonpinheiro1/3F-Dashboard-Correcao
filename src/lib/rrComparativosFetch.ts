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
type Historico = Map<string, RrCmpPonto | null>;
let cache: { key: string; exp: number; hist: Historico } | null = null;

async function mapPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const chunk = await Promise.all(items.slice(i, i + n).map(fn));
    out.push(...chunk);
  }
  return out;
}

function abortError(): Error {
  return typeof DOMException !== 'undefined'
    ? new DOMException('Aborted', 'AbortError')
    : Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

/** Dias anteriores são cacheados; `hoje` (live) sempre entra fresco no cálculo. */
export async function fetchRrComparativos(opts: {
  dataRef: string;
  campanha: CampanhaOp;
  hoje: RrCmpPonto;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<RrComparativo> {
  const key = `${opts.dataRef}|${opts.campanha}`;
  const janela = janelaComparativo(opts.dataRef);
  const mesDias = diasDoMesAte(opts.dataRef).filter((d) => d !== opts.dataRef);

  let hist: Historico;
  if (!opts.force && cache && cache.key === key && Date.now() < cache.exp) {
    hist = cache.hist;
  } else {
    const sparkDias = janela.spark.filter((d) => d !== opts.dataRef);
    const extra = [...new Set([...mesDias, janela.d1, janela.d7, ...sparkDias])];
    const loaded = await mapPool(extra, 5, async (dia) => {
      if (opts.signal?.aborted) throw abortError();
      const p = await fetchEvaDia(dia, opts.signal);
      return { dia, p };
    });
    if (opts.signal?.aborted) throw abortError();
    hist = new Map(loaded.map((x) => [x.dia, pontoDePayload(x.dia, x.p, opts.campanha)]));
    cache = { key, exp: Date.now() + TTL, hist };
  }

  const ponto = (dia: string): RrCmpPonto | null => hist.get(dia) ?? null;

  const spark: RrCmpPonto[] = janela.spark.map((d) =>
    d === opts.dataRef ? opts.hoje : ponto(d) || { dia: d, vendas: 0, cpcPct: 0 },
  );
  const mtdVendas =
    opts.hoje.vendas + mesDias.reduce((s, d) => s + (ponto(d)?.vendas || 0), 0);

  return montarComparativo({
    hoje: opts.hoje,
    d1: ponto(janela.d1),
    d7: ponto(janela.d7),
    spark,
    mtdVendas,
  });
}

/** Só testes. */
export function _resetRrComparativosCache() {
  cache = null;
}
