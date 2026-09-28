import {
  aggregateCorrecao,
  mergeSms,
  mergeToutbox,
  type CorrecaoRow,
  type CuboOverview,
  type SmsRow,
  type ToutboxEntregaRow,
} from '../../functions/_lib/cuboAggregates';
import { queryCubo, type CuboFilter, type CuboTable } from './cuboQuery';
import { filtrosRecorteCubo, noRecorte, type Recorte } from './recorteFiltro';
import { smsDataVendaBounds } from './smsRules';

const PAGINA = 1000;
const MAX_PAGINAS = 50;

export function filtrosPeriodoRecorte(de: string, ate: string, recorte: Recorte): CuboFilter[] {
  const bounds = smsDataVendaBounds(de, ate);
  const out: CuboFilter[] = [];
  if (bounds.gte) out.push({ column: 'data_venda', op: 'gte', value: bounds.gte });
  if (bounds.lte) out.push({ column: 'data_venda', op: 'lte', value: bounds.lte });
  return [...out, ...filtrosRecorteCubo(recorte)];
}

/** Mesma semântica do cubo-overview, só com as linhas daquela equipe/supervisor. */
export function agregarOperadoresRecorte(
  logs: CorrecaoRow[],
  sms: SmsRow[],
  tbx: ToutboxEntregaRow[],
  recorte: Recorte,
  periodo: { de: string; ate: string },
): CuboOverview['operadores'] {
  const dentro = <T extends { supervisor?: string | null; equipe?: string | null }>(rows: T[]) =>
    rows.filter((r) => noRecorte(r, recorte));
  return mergeToutbox(mergeSms(aggregateCorrecao(dentro(logs)), dentro(sms), periodo), dentro(tbx)).operadores;
}

async function buscarTudo<T>(
  table: CuboTable,
  select: string[],
  filters: CuboFilter[],
  order: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const from = pagina * PAGINA;
    const batch = await queryCubo<T>({
      table, select, filters, order: { column: order, ascending: true }, from, to: from + PAGINA - 1, signal,
    });
    rows.push(...batch);
    if (batch.length < PAGINA) return rows;
  }
  throw new Error(`Recorte excede ${MAX_PAGINAS * PAGINA} registros em ${table}; reduza o período.`);
}

export async function fetchOperadoresRecorte(
  de: string,
  ate: string,
  recorte: Recorte,
  signal?: AbortSignal,
): Promise<CuboOverview['operadores']> {
  const filters = filtrosPeriodoRecorte(de, ate, recorte);
  const [logs, sms, tbx] = await Promise.all([
    // `id` asc = ordem cronológica das passagens, exigida por consolidarPorProposta.
    buscarTudo<CorrecaoRow>('correcao_logs', ['proposta_id', 'vendedor', 'equipe', 'supervisor', 'tipos_erro', 'campos_alterados', 'elapsed_ms'], filters, 'id', signal),
    buscarTudo<SmsRow>('sms_eficiencia', ['proposta_id', 'vendedor', 'equipe', 'supervisor', 'sms_previo', 'classificacao', 'ticket_status', 'order_status', 'retorno_atualizado_em'], filters, 'proposta_id', signal),
    buscarTudo<ToutboxEntregaRow>('toutbox_entrega', ['proposta_id', 'vendedor', 'equipe', 'supervisor', 'status', 'evento_ultimo', 'consultado_em'], filters, 'proposta_id', signal),
  ]);
  return agregarOperadoresRecorte(logs, sms, tbx, recorte, { de, ate });
}
