/**
 * Validação cruzada funil ↔ histórico e fatias exclusivas.
 */
import type { FunilPayload, HistoricoPonto } from '../types/portabilidade';

export type GapReconciliacao = {
  campo: string;
  funil: number;
  historico: number;
  delta: number;
};

export type ReconciliacaoHistorico = {
  ok: boolean;
  gaps: GapReconciliacao[];
  nota: string;
};

function gap(campo: string, funil: number, historico: number): GapReconciliacao | null {
  if (funil === historico) return null;
  return { campo, funil, historico, delta: funil - historico };
}

/** Compara KPIs do funil gerencial com ponto do histórico (mesmo mês). */
export function reconciliaHistoricoFunil(
  g: FunilPayload['gerencial'] | undefined,
  h: HistoricoPonto | null | undefined,
  universoFunil?: number,
  truncamentos?: string[],
): ReconciliacaoHistorico | null {
  if (!g || !h) return null;

  const sucessoFunil = g.sucesso_tim ?? (g.portados ?? 0) + (g.falha_parcial ?? 0);
  const sucessoHist = h.sucesso_tim ?? h.portados + h.falha_parcial;
  // Histórico fecha com Portado+Falha+Cancelada; o funil vivo soma base_tim em `fechados`.
  const fechadosFunil =
    g.fechados_tim ??
    (g.portados ?? 0) + (g.falha_parcial ?? 0) + (g.canceladas ?? 0);
  const universoComparavel =
    typeof g.universo_cohort === 'number' && g.universo_cohort > 0 ? g.universo_cohort : universoFunil;

  const gaps = [
    gap('portados', g.portados ?? 0, h.portados),
    gap('falha_parcial', g.falha_parcial ?? 0, h.falha_parcial),
    gap('canceladas', g.canceladas ?? 0, h.canceladas),
    gap('fechados', fechadosFunil, h.fechados),
    gap('sucesso_tim', sucessoFunil, sucessoHist),
    gap('quebras', g.quebras ?? 0, h.quebras),
    gap('bko', g.bko ?? 0, h.bko),
    universoComparavel != null && h.universo != null
      ? gap('universo', universoComparavel, h.universo)
      : null,
  ].filter(Boolean) as GapReconciliacao[];

  return {
    ok: gaps.length === 0,
    gaps,
    nota: notaDivergencia(gaps, g, truncamentos),
  };
}

const CAMPOS_RESULTADO = new Set(['portados', 'falha_parcial', 'canceladas', 'fechados', 'sucesso_tim']);
const CAMPOS_DEFINICAO = new Set(['quebras', 'bko']);

/** Explica a causa real de cada tipo de gap (definição diferente ≠ truncamento). */
export function notaDivergencia(
  gaps: GapReconciliacao[],
  g: FunilPayload['gerencial'] | undefined,
  truncamentos?: string[],
): string {
  if (!gaps.length) return 'Histórico replica o funil gerencial deste mês.';
  const partes: string[] = [`Divergência em ${gaps.length} campo(s).`];
  const resultado = gaps.filter((x) => CAMPOS_RESULTADO.has(x.campo)).map((x) => x.campo);
  const definicao = gaps.filter((x) => CAMPOS_DEFINICAO.has(x.campo)).map((x) => x.campo);
  const universo = gaps.some((x) => x.campo === 'universo');
  if (resultado.length) {
    const trunc = (truncamentos || []).filter(Boolean);
    partes.push(
      trunc.length
        ? `${resultado.join(', ')}: funil ao vivo truncado (${trunc.join(', ')}) — resultado parcial.`
        : g?.fonte === 'cohort_congelada'
          ? `${resultado.join(', ')}: coorte congelada e histórico foram gravados em momentos diferentes.`
          : `${resultado.join(', ')}: funil lê o CE atual (cleanup apaga linhas antigas) e deduplica 3F-N/N; a RPC conta as linhas do mês com a chave crua até a migration 043.`,
    );
  }
  if (definicao.length) {
    partes.push(
      `${definicao.join(', ')}: definições diferentes — o funil conta a fatia atual exclusiva (1 proposta = 1 lugar); a RPC conta quem teve status quebra_logistica/bko no mês (updated_at), inclusive fora do universo. Diferença esperada.`,
    );
  }
  if (universo) {
    partes.push(
      'Universo: coorte RPC = propostas com atividade no CE no mês; funil vivo depende das páginas lidas e do cleanup. Em voo na coorte inclui Base TIM (a RPC não separa OS fim sem ticket).',
    );
  }
  return partes.join(' ');
}

/** Fatias exclusivas (portado+falha+cancelada+base_tim+quebra+em_voo) devem somar o universo. */
export function validarFunilExclusivo(
  exclusivo: Array<{ valor: number }> | undefined,
  universo: number,
): { ok: boolean; soma: number; delta: number } {
  const soma = (exclusivo || []).reduce((a, e) => a + e.valor, 0);
  return { ok: soma === universo, soma, delta: universo - soma };
}

/** Macro-grupos exclusivos devem somar o universo. */
export function validarEstagios(
  estagios: Array<{ valor: number }> | undefined,
  universo: number,
): { ok: boolean; soma: number; delta: number } {
  const soma = (estagios || []).reduce((a, e) => a + e.valor, 0);
  return { ok: soma === universo, soma, delta: universo - soma };
}
