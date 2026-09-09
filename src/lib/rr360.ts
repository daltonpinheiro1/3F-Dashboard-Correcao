/**
 * RR 360° — Gross, taxa erro, aprovadas, entregues, portados.
 * Fontes: sms_eficiencia (dia, Port), correcao_logs (dia), EVA crivo, portabilidade-funil (mês).
 *
 * Uma verdade por KPI:
 * - Gross / erro / portados Gross = dia BRT, universo Port (OS TIM 1-xxx; ICCID não filtra)
 * - Entregues / TIM (P+FP) = cohort mês
 * - Crivo = EVA do recorte (iSize só em Port/Todas, nunca com filtro Mig/BKO)
 */
import { temErroOperacional } from './erroClassification';
import { isPortadoConsolidado } from './smsRules';
import { fetchDashboardJson } from './disparosFormat';
import { isAbortError } from './brt';
import type { FunilPayload } from '../types/portabilidade';
import { isizeGlobalAplicavel, type CampanhaOp, type EvaJornada, type EvaPayload } from './evaDash';

export type Rr360Bloco = {
  aplicavel: boolean;
  vendasBrutas: number;
  portadosConsolidado: number;
  pctPortadosGross: number;
  portadosHoje: number;
  propostas: number;
  comErro: number;
  taxaErroPct: number;
  sucessoEva: number;
  aprovadas: number;
  vb: number;
  taxaAprovadasPct: number;
  isizeCruzamento: boolean;
  entregues: number;
  entreguesComChip: number;
  entreguesSemChip: number;
  emTransito: number;
  funilPortados: number;
  funilFalhaParcial: number;
  funilSucessoTim: number;
  funilUniverso: number;
  taxaSucessoTimPct: number;
  mes: string;
  janelaDia: string;
  fonteGross?: 'admin';
  listaGross?: Rr360ListaItem[];
  listaErro?: Rr360ListaItem[];
  erros?: string[];
};

type SmsRow = {
  proposta_id?: string | null;
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
  vendedor?: string | null;
};

export type Rr360ListaItem = {
  proposta_id: string;
  classificacao: string | null;
  ticket_status: string | null;
  vendedor: string | null;
  tipos_erro?: string[] | null;
};

type PortCache = {
  key: string;
  exp: number;
  sms: Pick<Rr360Bloco, 'vendasBrutas' | 'portadosConsolidado' | 'pctPortadosGross'>;
  erro: Pick<Rr360Bloco, 'propostas' | 'comErro' | 'taxaErroPct'>;
  funil: ReturnType<typeof agregarFunilLogistica>;
  portadosHoje: number;
  erros: string[];
  fonte: 'admin';
  listaGross: Rr360ListaItem[];
  listaErro: Rr360ListaItem[];
};

const PORT_CACHE_TTL_MS = 60_000;
let portCache: PortCache | null = null;
let inFlight: { key: string; promise: Promise<Omit<PortCache, 'key' | 'exp'>> } | null = null;

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function rr360PortAplicavel(campanha: CampanhaOp): boolean {
  return isizeGlobalAplicavel(campanha);
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

/**
 * iSize global só no recorte Port/Todas (iSize é Port-centric).
 * Com Mig/BKO filtrados, iSize global mentiria a taxa de aprovadas.
 */
export function agregarCrivoEva(
  jornada: EvaJornada[],
  kpis?: Record<string, number | boolean> | null,
  campanha: CampanhaOp = 'TODAS',
): Pick<Rr360Bloco, 'sucessoEva' | 'aprovadas' | 'vb' | 'taxaAprovadasPct' | 'isizeCruzamento'> {
  const isizeCruzamento = Boolean(kpis?.isize_cruzamento);
  const isizeTotal = Number(kpis?.isize_total || 0);
  const isizeAceitas = Number(kpis?.isize_aceitas || 0);
  const sucesso = jornada.reduce((s, j) => s + (j.sucesso || 0), 0);
  const aprovadas = jornada.reduce((s, j) => s + (j.aprovadas || 0), 0);
  const vb = jornada.reduce((s, j) => s + (j.vb || 0), 0);
  const usarIsize = rr360PortAplicavel(campanha) && isizeCruzamento && isizeTotal > 0;

  if (usarIsize) {
    return {
      sucessoEva: isizeTotal,
      aprovadas: isizeAceitas,
      vb: isizeTotal,
      taxaAprovadasPct: pct(isizeAceitas, isizeTotal),
      isizeCruzamento: true,
    };
  }
  return {
    sucessoEva: sucesso,
    aprovadas,
    vb,
    taxaAprovadasPct: pct(aprovadas, sucesso || vb),
    isizeCruzamento: false,
  };
}

export function agregarFunilLogistica(funil: FunilPayload | null): Pick<
  Rr360Bloco,
  | 'entregues'
  | 'entreguesComChip'
  | 'entreguesSemChip'
  | 'emTransito'
  | 'funilPortados'
  | 'funilFalhaParcial'
  | 'funilSucessoTim'
  | 'funilUniverso'
  | 'taxaSucessoTimPct'
> {
  const fatias = funil?.fatias || [];
  const count = (id: string) => fatias.find((f) => f.id === id)?.count ?? 0;
  const comChip = count('entregue_com_chip');
  const semChip = count('entregue_aguardando_chip');
  const emTransito = count('em_transito');
  const g = funil?.gerencial;
  const portados = g?.portados ?? 0;
  const falha = g?.falha_parcial ?? 0;
  const sucessoTim = g?.sucesso_tim ?? portados + falha;
  const universo = funil?.reconciliacao?.universo ?? 0;
  return {
    entregues: comChip + semChip,
    entreguesComChip: comChip,
    entreguesSemChip: semChip,
    emTransito,
    funilPortados: portados,
    funilFalhaParcial: falha,
    funilSucessoTim: sucessoTim,
    funilUniverso: universo,
    taxaSucessoTimPct: g?.taxa_sucesso_tim_pct ?? pct(sucessoTim, universo),
  };
}

export function agregarSmsDia(
  rows: SmsRow[],
): Pick<Rr360Bloco, 'vendasBrutas' | 'portadosConsolidado' | 'pctPortadosGross'> {
  const uniq = dedupePorProposta(rows, (a, b) => (isPortadoConsolidado(b) ? b : a));
  const vendasBrutas = uniq.length;
  const portadosConsolidado = uniq.filter(isPortadoConsolidado).length;
  return {
    vendasBrutas,
    portadosConsolidado,
    pctPortadosGross: pct(portadosConsolidado, vendasBrutas),
  };
}

const LISTA_CAP = 80;

export function listaGrossDia(rows: SmsRow[], cap = LISTA_CAP): Rr360ListaItem[] {
  const uniq = dedupePorProposta(rows, (a, b) => (isPortadoConsolidado(b) ? b : a));
  return uniq.slice(0, cap).map((r) => ({
    proposta_id: String(r.proposta_id || '—'),
    classificacao: r.classificacao ?? null,
    ticket_status: r.ticket_status ?? null,
    vendedor: r.vendedor ?? null,
  }));
}

export function listaErroDia(
  rows: Array<{ proposta_id?: string | null; vendedor?: string | null; tipos_erro?: string[] | null }>,
  cap = LISTA_CAP,
): Rr360ListaItem[] {
  return rows
    .filter((r) => temErroOperacional(r.tipos_erro ?? []))
    .slice(0, cap)
    .map((r) => ({
      proposta_id: String(r.proposta_id || '—'),
      classificacao: null,
      ticket_status: null,
      vendedor: r.vendedor ?? null,
      tipos_erro: r.tipos_erro ?? null,
    }));
}

export function agregarErroDia(
  rows: Array<{ tipos_erro?: string[] | null }>,
): Pick<Rr360Bloco, 'propostas' | 'comErro' | 'taxaErroPct'> {
  const propostas = rows.length;
  const comErro = rows.filter((r) => temErroOperacional(r.tipos_erro ?? [])).length;
  return { propostas, comErro, taxaErroPct: pct(comErro, propostas) };
}

function cacheKey(dataRef: string, mes: string, campanha: CampanhaOp) {
  return `${dataRef}|${mes}|${campanha}`;
}

type Rr360AdminPayload = {
  fonte?: string;
  vendasBrutas: number;
  portadosConsolidado: number;
  pctPortadosGross: number;
  propostas: number;
  comErro: number;
  taxaErroPct: number;
  portadosHoje: number;
  listaGross?: Rr360ListaItem[];
  listaErro?: Rr360ListaItem[];
};

async function fetchPortBlocos(opts: {
  dataRef: string;
  mes: string;
  signal?: AbortSignal;
}): Promise<Omit<PortCache, 'key' | 'exp'>> {
  const { dataRef, mes, signal } = opts;
  const erros: string[] = [];
  const emptySms = { vendasBrutas: 0, portadosConsolidado: 0, pctPortadosGross: 0 };
  const emptyErro = { propostas: 0, comErro: 0, taxaErroPct: 0 };
  const emptyFunil = agregarFunilLogistica(null);

  const funilP = fetchDashboardJson<FunilPayload>(
    `/api/portabilidade-funil?mes=${encodeURIComponent(mes)}&modo=gerencial`,
    signal,
  );

  let sms = emptySms;
  let erro = emptyErro;
  let portadosHoje = 0;
  const fonte = 'admin' as const;
  let listaGross: Rr360ListaItem[] = [];
  let listaErro: Rr360ListaItem[] = [];

  try {
    const admin = await fetchDashboardJson<Rr360AdminPayload>(
      `/api/rr-360?dataRef=${encodeURIComponent(dataRef)}&mes=${encodeURIComponent(mes)}`,
      signal,
    );
    sms = {
      vendasBrutas: admin.vendasBrutas,
      portadosConsolidado: admin.portadosConsolidado,
      pctPortadosGross: admin.pctPortadosGross,
    };
    erro = { propostas: admin.propostas, comErro: admin.comErro, taxaErroPct: admin.taxaErroPct };
    portadosHoje = admin.portadosHoje;
    listaGross = admin.listaGross || [];
    listaErro = admin.listaErro || [];
  } catch (e) {
    if (isAbortError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    erros.push(`Gross/erro indisponível: ${msg}`);
  }

  let funil = emptyFunil;
  try {
    funil = agregarFunilLogistica(await funilP);
  } catch (e) {
    if (isAbortError(e)) throw e;
    erros.push(`Funil: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { sms, erro, funil, portadosHoje, erros, fonte, listaGross, listaErro };
}

/** Carrega blocos 360 do dia (BRT) + funil do mês. Cacheia Port para não re-paginar a cada poll EVA. */
async function waitForCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function fetchRr360(opts: {
  dataRef: string;
  mes: string;
  eva: EvaPayload | null;
  jornadaFiltrada: EvaJornada[];
  campanha: CampanhaOp;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<Rr360Bloco> {
  const { dataRef, mes, eva, jornadaFiltrada, campanha, signal, force } = opts;
  const crivo = agregarCrivoEva(jornadaFiltrada, eva?.kpis_chamadas ?? null, campanha);

  if (!rr360PortAplicavel(campanha)) {
    return {
      ...emptyRr360(mes, dataRef),
      ...crivo,
      aplicavel: false,
      erros: ['Gross / erro / TIM são Port-centric — recorte Mig ou BKO não aplica (evita misturar EVA com 360° de outra campanha).'],
    };
  }

  const key = cacheKey(dataRef, mes, campanha);
  const now = Date.now();

  if (!force && portCache && portCache.key === key && now < portCache.exp) {
    return mergePort(portCache, crivo, mes, dataRef);
  }

  if (!force && inFlight && inFlight.key === key) {
    const port = await waitForCaller(inFlight.promise, signal);
    return mergePort({ ...port, key, exp: now + PORT_CACHE_TTL_MS }, crivo, mes, dataRef);
  }

  // O request compartilhado não herda o AbortSignal de um consumidor.
  // Cada caller pode desistir sem cancelar os demais.
  const promise = fetchPortBlocos({ dataRef, mes });
  inFlight = { key, promise };
  try {
    const port = await waitForCaller(promise, signal);
    portCache = { ...port, key, exp: Date.now() + PORT_CACHE_TTL_MS };
    return mergePort(portCache, crivo, mes, dataRef);
  } finally {
    if (inFlight?.key === key) inFlight = null;
  }
}

function mergePort(
  port: Omit<PortCache, 'key' | 'exp'> & Partial<Pick<PortCache, 'key' | 'exp'>>,
  crivo: ReturnType<typeof agregarCrivoEva>,
  mes: string,
  dataRef: string,
): Rr360Bloco {
  return {
    aplicavel: true,
    ...port.sms,
    ...port.erro,
    ...crivo,
    ...port.funil,
    portadosHoje: port.portadosHoje,
    mes,
    janelaDia: dataRef,
    fonteGross: port.fonte,
    listaGross: port.listaGross,
    listaErro: port.listaErro,
    erros: port.erros.length ? port.erros : undefined,
  };
}

export function emptyRr360(mes: string, janelaDia = ''): Rr360Bloco {
  return {
    aplicavel: true,
    vendasBrutas: 0,
    portadosConsolidado: 0,
    pctPortadosGross: 0,
    portadosHoje: 0,
    propostas: 0,
    comErro: 0,
    taxaErroPct: 0,
    sucessoEva: 0,
    aprovadas: 0,
    vb: 0,
    taxaAprovadasPct: 0,
    isizeCruzamento: false,
    entregues: 0,
    entreguesComChip: 0,
    entreguesSemChip: 0,
    emTransito: 0,
    funilPortados: 0,
    funilFalhaParcial: 0,
    funilSucessoTim: 0,
    funilUniverso: 0,
    taxaSucessoTimPct: 0,
    mes,
    janelaDia,
  };
}

/** Só testes — zera cache de paginação. */
export function _resetRr360Cache() {
  portCache = null;
  inFlight = null;
}
