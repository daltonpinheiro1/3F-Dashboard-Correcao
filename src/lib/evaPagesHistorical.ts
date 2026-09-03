import { fetchEvaDia, type EvaJornada, type EvaPayload, type SupervisorResumo } from './evaDash';

const FETCH_BATCH_SIZE = 15;

export function listarDiasHistoricos(from: string, to: string): string[] {
  const inicio = new Date(`${from}T00:00:00`);
  const fim = new Date(`${to}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) return [];

  const dias: string[] = [];
  const atual = new Date(inicio);
  while (atual <= fim) {
    const ano = atual.getFullYear();
    const mes = String(atual.getMonth() + 1).padStart(2, '0');
    const dia = String(atual.getDate()).padStart(2, '0');
    dias.push(`${ano}-${mes}-${dia}`);
    atual.setDate(atual.getDate() + 1);
  }
  return dias;
}

/** Carrega todo o intervalo; fetchEvaPeriodo é intencionalmente limitado a 31 dias. */
export async function fetchEvaPeriodoPaginas(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<{ dias: EvaPayload[]; faltando: string[] }> {
  const datas = listarDiasHistoricos(from, to);
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
  return { dias: encontrados, faltando };
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
