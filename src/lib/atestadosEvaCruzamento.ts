import type { Atestado } from './atestadosEscala';
import type { EvaJornada, EvaPayload } from './evaDash';
import { fetchEvaDia } from './evaDash';
import { diasEfetivos } from './atestadosDuplicidade';

export type EvaCruzamentoDia = {
  data: string;
  logado_seg: number;
  situacao: 'consistente' | 'divergente' | 'sem_dado';
  detalhe: string;
};

export type EvaCruzamentoItem = {
  atestado: Atestado;
  dias: EvaCruzamentoDia[];
  resumo: 'ok' | 'alerta' | 'indefinido';
};

function normNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchJornada(j: EvaJornada, a: Atestado): boolean {
  const login = String(a.colaborador_matricula || '').trim().toLowerCase();
  const nome = normNome(a.colaborador_nome || '');
  const jLogin = String(j.login || '').trim().toLowerCase();
  const jNome = normNome(j.user_name || j.login || '');
  if (login && jLogin && login === jLogin) return true;
  if (nome && jNome && (jNome.includes(nome) || nome.includes(jNome))) return true;
  return false;
}

function diasNoPeriodo(a: Atestado): string[] {
  const ini = a.data_inicio?.slice(0, 10);
  if (!ini) return [];
  const n = diasEfetivos(a);
  const out: string[] = [];
  const start = new Date(`${ini}T12:00:00`);
  for (let i = 0; i < Math.min(n, 31); i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const LOGADO_ALERTA_SEG = 3600;

export function cruzarAtestadoComEva(atestado: Atestado, payloads: Map<string, EvaPayload>): EvaCruzamentoItem {
  const dias = diasNoPeriodo(atestado);
  const resultado: EvaCruzamentoDia[] = [];
  for (const data of dias) {
    const eva = payloads.get(data);
    if (!eva) {
      resultado.push({ data, logado_seg: 0, situacao: 'sem_dado', detalhe: 'Sem snapshot EVA' });
      continue;
    }
    const jornadas = (eva.jornada || []).filter((j) => matchJornada(j, atestado));
    const logado = jornadas.reduce((s, j) => s + (Number(j.logged_time) || 0), 0);
    if (logado >= LOGADO_ALERTA_SEG) {
      resultado.push({
        data,
        logado_seg: logado,
        situacao: 'divergente',
        detalhe: `Jornada EVA ${Math.round(logado / 3600)}h no dia de atestado`,
      });
    } else if (jornadas.length === 0) {
      resultado.push({
        data,
        logado_seg: 0,
        situacao: 'consistente',
        detalhe: 'Sem jornada EVA (compatível com afastamento)',
      });
    } else {
      resultado.push({
        data,
        logado_seg: logado,
        situacao: 'consistente',
        detalhe: `Logado reduzido (${Math.round(logado / 60)} min)`,
      });
    }
  }
  const diverg = resultado.filter((d) => d.situacao === 'divergente').length;
  const sem = resultado.filter((d) => d.situacao === 'sem_dado').length;
  const resumo = diverg > 0 ? 'alerta' : sem === resultado.length ? 'indefinido' : 'ok';
  return { atestado, dias: resultado, resumo };
}

export async function carregarEvaParaAtestados(
  atestados: Atestado[],
  ano: number,
): Promise<Map<string, EvaPayload>> {
  const datas = new Set<string>();
  for (const a of atestados) {
    if (!String(a.data_inicio || '').startsWith(String(ano))) continue;
    for (const d of diasNoPeriodo(a)) datas.add(d);
  }
  const map = new Map<string, EvaPayload>();
  const lista = [...datas].slice(0, 40);
  await Promise.all(
    lista.map(async (iso) => {
      const p = await fetchEvaDia(iso).catch(() => null);
      if (p) map.set(iso, p);
    }),
  );
  return map;
}

export function listarCruzamentos(
  atestados: Atestado[],
  evaMap: Map<string, EvaPayload>,
  ano: number,
): EvaCruzamentoItem[] {
  return atestados
    .filter(
      (a) =>
        (a.status === 'aprovado' || a.status === 'arquivado') &&
        String(a.data_inicio || a.created_at?.slice(0, 10) || '').startsWith(String(ano)),
    )
    .map((a) => cruzarAtestadoComEva(a, evaMap));
}

/** Reexport period helper for client */
export { periodosSobrepoem } from './atestadosDuplicidade';
