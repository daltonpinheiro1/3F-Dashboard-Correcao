/** Cálculo de período — espelha resolverFim em atestadosDuplicidade. */

import { resolverFim, type PeriodoRef } from './atestadosDuplicidade';

function msToIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Infere data_fim a partir de início + quantidade de dias quando ausente. */
export function inferirDataFim(p: PeriodoRef): string | null {
  if (p.data_fim) return String(p.data_fim).slice(0, 10);
  const fimMs = resolverFim(p);
  if (fimMs == null) return null;
  return msToIsoDate(fimMs);
}

/** Completa campos de período na análise IA/OCR antes de aplicar no formulário. */
export function completarAnalisePeriodo<T extends PeriodoRef & { quantidade_dias?: number }>(
  analise: T,
): T {
  const out = { ...analise };
  if (!out.data_fim && out.data_inicio && out.unidade_periodo !== 'horas') {
    const qtd = Number(out.quantidade_dias) || 0;
    if (qtd > 0) {
      out.data_fim = inferirDataFim({
        data_inicio: out.data_inicio,
        quantidade_dias: qtd,
        unidade_periodo: out.unidade_periodo || 'dias',
      });
    }
  }
  if (!out.quantidade_dias && out.data_inicio && out.data_fim && out.unidade_periodo !== 'horas') {
    const ini = Date.parse(`${out.data_inicio.slice(0, 10)}T12:00:00Z`);
    const fim = Date.parse(`${out.data_fim.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(ini) && !Number.isNaN(fim) && fim >= ini) {
      out.quantidade_dias = Math.round((fim - ini) / 86_400_000) + 1;
    }
  }
  return out;
}
