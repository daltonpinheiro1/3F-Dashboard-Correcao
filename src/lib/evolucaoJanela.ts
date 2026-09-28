import { shiftIsoDay } from './brt';

export type Janela = { de: string; ate: string };

/** Últimos `dias` dias até hoje (inclusive) e a janela anterior de mesmo tamanho. */
export function janelasEvolucao(hoje: string, dias: number): { atual: Janela; anterior: Janela } {
  return {
    atual: { de: shiftIsoDay(hoje, -(dias - 1)), ate: hoje },
    anterior: { de: shiftIsoDay(hoje, -(2 * dias - 1)), ate: shiftIsoDay(hoje, -dias) },
  };
}

export function naJanela(dia: string, janela: Janela): boolean {
  return dia >= janela.de && dia <= janela.ate;
}

export type ResumoJanela = {
  propostas: number;
  erros: number;
  taxaPct: number;
  diasComDados: number;
  mediaPorDia: number;
};

/** Taxa ponderada pelo volume (erros / propostas), não média das taxas diárias. */
export function resumoJanela(
  dados: Array<{ dia: string; total_propostas: number; total_corrigidas: number }>,
  janela: Janela,
): ResumoJanela {
  let propostas = 0;
  let erros = 0;
  let diasComDados = 0;
  for (const d of dados) {
    if (!naJanela(d.dia, janela)) continue;
    propostas += d.total_propostas;
    erros += d.total_corrigidas;
    if (d.total_propostas > 0) diasComDados += 1;
  }
  return {
    propostas,
    erros,
    taxaPct: propostas > 0 ? (erros / propostas) * 100 : 0,
    diasComDados,
    mediaPorDia: diasComDados > 0 ? propostas / diasComDados : 0,
  };
}

/** Variação relativa da taxa; null quando a janela anterior não tem base. */
export function tendenciaPct(atual: ResumoJanela, anterior: ResumoJanela): number | null {
  if (anterior.propostas === 0 || anterior.taxaPct === 0 || atual.propostas === 0) return null;
  return ((atual.taxaPct - anterior.taxaPct) / anterior.taxaPct) * 100;
}

export function restringirAoUniverso<T extends { proposta_id?: string | null }>(
  rows: T[],
  ids: Set<string>,
): T[] {
  return rows.filter((r) => ids.has(String(r.proposta_id || '').trim()));
}

export type SmsDiaContagem = {
  com: number; sem: number;
  suc_com: number; suc_sem: number;
  ins_com: number; ins_sem: number;
  agd_com: number; agd_sem: number;
};

export function somarSmsDias(rows: SmsDiaContagem[]): SmsDiaContagem {
  return rows.reduce<SmsDiaContagem>((acc, d) => ({
    com: acc.com + d.com, sem: acc.sem + d.sem,
    suc_com: acc.suc_com + d.suc_com, suc_sem: acc.suc_sem + d.suc_sem,
    ins_com: acc.ins_com + d.ins_com, ins_sem: acc.ins_sem + d.ins_sem,
    agd_com: acc.agd_com + d.agd_com, agd_sem: acc.agd_sem + d.agd_sem,
  }), { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 });
}
