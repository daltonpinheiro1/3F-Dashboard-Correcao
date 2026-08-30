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
): ReconciliacaoHistorico | null {
  if (!g || !h) return null;

  const sucessoFunil = g.sucesso_tim ?? (g.portados ?? 0) + (g.falha_parcial ?? 0);
  const sucessoHist = h.sucesso_tim ?? h.portados + h.falha_parcial;

  const gaps = [
    gap('portados', g.portados ?? 0, h.portados),
    gap('falha_parcial', g.falha_parcial ?? 0, h.falha_parcial),
    gap('canceladas', g.canceladas ?? 0, h.canceladas),
    gap('fechados', g.fechados ?? 0, h.fechados),
    gap('sucesso_tim', sucessoFunil, sucessoHist),
    gap('quebras', g.quebras ?? 0, h.quebras),
    gap('bko', g.bko ?? 0, h.bko),
    universoFunil != null && h.universo != null
      ? gap('universo', universoFunil, h.universo)
      : null,
  ].filter(Boolean) as GapReconciliacao[];

  const truncado = gaps.some((x) => Math.abs(x.delta) > 0 && x.campo !== 'universo');

  return {
    ok: gaps.length === 0,
    gaps,
    nota:
      gaps.length === 0
        ? 'Histórico replica o funil gerencial deste mês.'
        : truncado
          ? `Divergência em ${gaps.length} campo(s). Verifique truncamento do funil ou RPC 027 no Supabase.`
          : `Universo diverge — cohort funil vs histórico RPC.`,
  };
}

/** Fatias exclusivas (portado+falha+cancelada+em_voo) devem somar o universo. */
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
