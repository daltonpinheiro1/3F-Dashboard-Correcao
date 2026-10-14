import { shiftIsoDay } from './brt';
import { fetchEvaDia, type EvaJornada, type EvaPayload, type SupervisorResumo } from './evaDash';

const FETCH_BATCH_SIZE = 15;
export const HIST_MAX_DIAS = 31;
/** Ano digitado pela metade (ex.: 0002-…) não pode varrer centenas de milhares de dias. */
const LISTAR_DIAS_TETO = 366 * 2;

export function listarDiasHistoricos(
  from: string,
  to: string,
  opts?: { max?: number; fromEnd?: boolean },
): string[] {
  const inicio = from?.slice(0, 10) || '';
  const fim = to?.slice(0, 10) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
    return [];
  }

  const max = opts?.max && opts.max > 0 ? opts.max : undefined;
  const dias: string[] = [];
  if (max && opts?.fromEnd !== false) {
    let atual = fim;
    while (atual >= inicio && dias.length < max) {
      dias.push(atual);
      atual = shiftIsoDay(atual, -1);
    }
    return dias.reverse();
  }
  const teto = max ?? LISTAR_DIAS_TETO;
  let atual = inicio;
  while (atual <= fim && dias.length < teto) {
    dias.push(atual);
    atual = shiftIsoDay(atual, 1);
  }
  return dias;
}

/** Carrega o intervalo; teto padrão 31 dias (os mais recentes). RR semestral passa max 90. */
export async function fetchEvaPeriodoPaginas(
  from: string,
  to: string,
  signal?: AbortSignal,
  opts?: { max?: number },
): Promise<{
  dias: EvaPayload[];
  faltando: string[];
  truncado: boolean;
  recorteFrom: string;
  recorteTo: string;
  pedidoN: number;
}> {
  const max = opts?.max ?? HIST_MAX_DIAS;
  const pedido = listarDiasHistoricos(from, to);
  const datas = listarDiasHistoricos(from, to, { max });
  const truncado = pedido.length > max;
  const encontrados: EvaPayload[] = [];
  const faltando: string[] = [];

  for (let i = 0; i < datas.length; i += FETCH_BATCH_SIZE) {
    const lote = datas.slice(i, i + FETCH_BATCH_SIZE);
    const resultados = await Promise.all(
      lote.map(async (data) => ({ data, payload: await fetchEvaDia(data, signal) })),
    );
    for (const resultado of resultados) {
      if (resultado.payload) encontrados.push(resultado.payload);
      else faltando.push(resultado.data);
    }
  }
  return {
    dias: encontrados,
    faltando,
    truncado,
    recorteFrom: datas[0] || '',
    recorteTo: datas[datas.length - 1] || '',
    pedidoN: pedido.length,
  };
}

function diaJornada(jornada: EvaJornada): string {
  return String(
    jornada.date_report || jornada.primeiro_login || jornada.date_login || '_',
  ).slice(0, 10);
}

/** No histórico, "operadores" significa usuários distintos em cada dia (usuário-dia). */
export function aplicarUsuariosUnicosPorDia(
  supervisores: SupervisorResumo[],
  jornada: EvaJornada[],
): SupervisorResumo[] {
  const porSupervisor = new Map<string, Set<string>>();
  for (const item of jornada) {
    const supervisor = item.supervisor_name || 'Sem supervisor';
    const usuario = String(item.login || item.id_user || '').trim();
    if (!usuario) continue;
    if (!porSupervisor.has(supervisor)) porSupervisor.set(supervisor, new Set());
    porSupervisor.get(supervisor)!.add(`${diaJornada(item)}|${usuario}`);
  }
  return supervisores.map((supervisor) => {
    const usuariosDia = porSupervisor.get(supervisor.supervisor)?.size || 0;
    return { ...supervisor, operadores: usuariosDia, logados: usuariosDia };
  });
}
