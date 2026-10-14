import { shiftIsoDay } from './brt';
import { hasSmsInfo, isAguardando, isComSms, isPortadoConsolidado, isSemSms } from './smsRules';

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

export function smsDiaVazio(): SmsDiaContagem {
  return { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 };
}

type SmsClassificavel = {
  sms_previo?: boolean | null;
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
};

/** Sucesso, insucesso e aguardando são exclusivos: portado consolidado vence a classificação. */
export function contarSms(acc: SmsDiaContagem, row: SmsClassificavel): SmsDiaContagem {
  if (!hasSmsInfo(row.sms_previo)) return acc;
  const portado = isPortadoConsolidado(row);
  const insucesso = !portado && row.classificacao === 'insucesso';
  const aguardando = !portado && !insucesso && isAguardando(row.classificacao);
  if (isComSms(row.sms_previo)) {
    acc.com += 1;
    if (portado) acc.suc_com += 1;
    else if (insucesso) acc.ins_com += 1;
    else if (aguardando) acc.agd_com += 1;
  } else if (isSemSms(row.sms_previo)) {
    acc.sem += 1;
    if (portado) acc.suc_sem += 1;
    else if (insucesso) acc.ins_sem += 1;
    else if (aguardando) acc.agd_sem += 1;
  }
  return acc;
}

type PassagemDia = {
  data_venda?: string | null;
  tipos_erro?: string[] | null;
  elapsed_ms?: number | null;
  vendedor?: string | null;
};

export type DiaEvolucao = {
  dia: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  tempo_medio_ms: number;
  vendedores_ativos: number;
};

/**
 * Volume e erro por proposta consolidada; tempo médio por passagem.
 * Passagens do Roboadm ficam fora do tempo, como as propostas dele ficam fora do volume.
 */
export function agregarDiasEvolucao(
  passagens: PassagemDia[],
  propostas: PassagemDia[],
  ehRobo: (vendedor: string | null | undefined) => boolean,
  temErro: (tipos: string[]) => boolean,
): DiaEvolucao[] {
  const porDia: Record<string, { total: number; erros: number; tempoTotal: number; passagens: number; vendedores: Set<string> }> = {};
  const diaDe = (row: PassagemDia) => {
    const dia = (row.data_venda || '').slice(0, 10);
    if (dia.length !== 10) return null;
    if (!porDia[dia]) porDia[dia] = { total: 0, erros: 0, tempoTotal: 0, passagens: 0, vendedores: new Set() };
    return porDia[dia];
  };
  for (const row of propostas) {
    const d = diaDe(row);
    if (!d) continue;
    d.total += 1;
    if (temErro(row.tipos_erro ?? [])) d.erros += 1;
    if (row.vendedor && !ehRobo(row.vendedor)) d.vendedores.add(row.vendedor);
  }
  for (const row of passagens) {
    if (ehRobo(row.vendedor)) continue;
    const d = diaDe(row);
    if (!d) continue;
    d.passagens += 1;
    d.tempoTotal += row.elapsed_ms ?? 0;
  }
  return Object.entries(porDia)
    .map(([dia, d]) => ({
      dia,
      total_propostas: d.total,
      total_corrigidas: d.erros,
      taxa_erro_pct: d.total > 0 ? Math.round((d.erros / d.total) * 1000) / 10 : 0,
      tempo_medio_ms: d.passagens > 0 ? Math.round(d.tempoTotal / d.passagens) : 0,
      vendedores_ativos: d.vendedores.size,
    }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
}

/** SMS por dia de venda; ignora linhas sem info de SMS e as do Roboadm (como o cubo de Operadores/Supervisores). */
export function smsPorDiaSemRobo<T extends SmsClassificavel & { vendedor?: string | null; data_venda?: string | null }>(
  rows: T[],
  ehRobo: (vendedor: string | null | undefined) => boolean,
): Record<string, SmsDiaContagem> {
  const porDia: Record<string, SmsDiaContagem> = {};
  for (const row of rows) {
    if (!hasSmsInfo(row.sms_previo) || ehRobo(row.vendedor)) continue;
    const dia = (row.data_venda || '').slice(0, 10);
    if (!dia) continue;
    porDia[dia] = contarSms(porDia[dia] || smsDiaVazio(), row);
  }
  return porDia;
}

export function somarSmsDias(rows: SmsDiaContagem[]): SmsDiaContagem {
  return rows.reduce<SmsDiaContagem>((acc, d) => ({
    com: acc.com + d.com, sem: acc.sem + d.sem,
    suc_com: acc.suc_com + d.suc_com, suc_sem: acc.suc_sem + d.suc_sem,
    ins_com: acc.ins_com + d.ins_com, ins_sem: acc.ins_sem + d.ins_sem,
    agd_com: acc.agd_com + d.agd_com, agd_sem: acc.agd_sem + d.agd_sem,
  }), { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 });
}
