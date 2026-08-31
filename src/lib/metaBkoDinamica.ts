/**
 * Referências dinâmicas para Ação BKO (sem meta fixa emprestada de Port/Mig).
 * Usa comportamento médio do próprio BKO (dia / semana) como linha de base.
 */
import { horaBrt } from './brt';
import type { EvaSerieHora } from './evaDash';
import { diasDoMes, HORAS, horaKey } from './horaPageData';

export const BKO_ALERTA_FATOR = 0.85;

export type BkoRefs = {
  /** CPC% de referência (média BKO) */
  metaCpc: number;
  metaCpcFonte: 'media_dia' | 'media_semana' | 'fallback_store';
  /** Meta de vendas do dia = ritmo médio projetado */
  metaVendasDia: number;
  /** Equivalente mensal para buildNowcast (metaDia ≈ metaVendasDia) */
  metaVendasMesEquiv: number;
  /** Horas com atividade BKO (ou mediana semana), clamp 4–13 */
  expedienteHoras: number;
  /** Limiar de alerta = metaCpc * 0.85 */
  limiarAlertaCpc: number;
  vendasHoje: number;
  tabuladasHoje: number;
  cpcHoje: number;
};

function pct(cpc: number, total: number): number {
  return total > 0 ? Math.round((cpc / total) * 1000) / 10 : 0;
}

function clampExp(n: number): number {
  return Math.min(13, Math.max(4, Math.round(n)));
}

/**
 * Resolve refs BKO a partir da série filtrada + histórico semanal opcional.
 */
export function resolveBkoRefs(opts: {
  serieBko: EvaSerieHora[];
  weekHist?: { vendas: number; cpc: number }[];
  metaDiaStore: number;
  dataRef: string;
  horaAtual?: string;
}): BkoRefs {
  const { serieBko, weekHist = [], metaDiaStore, dataRef, horaAtual } = opts;

  const tabuladasHoje = serieBko.reduce((s, r) => s + (r.total || 0), 0);
  const cpcN = serieBko.reduce((s, r) => s + (r.cpc || 0), 0);
  const vendasHoje = serieBko.reduce((s, r) => s + (r.sucesso || 0), 0);
  const cpcHoje = pct(cpcN, tabuladasHoje);

  const horasAtivas = new Set(
    serieBko.filter((r) => (r.total || 0) > 0).map((r) => horaKey(r.hora)),
  );

  const weekCpc = weekHist.map((w) => w.cpc).filter((c) => c > 0);
  const weekVendas = weekHist.map((w) => w.vendas);
  const mediaSemanaCpc =
    weekCpc.length > 0
      ? Math.round((weekCpc.reduce((a, b) => a + b, 0) / weekCpc.length) * 10) / 10
      : 0;
  const mediaSemanaVendas =
    weekVendas.length > 0
      ? Math.round(weekVendas.reduce((a, b) => a + b, 0) / weekVendas.length)
      : 0;

  let metaCpc: number;
  let metaCpcFonte: BkoRefs['metaCpcFonte'];
  if (tabuladasHoje >= 15 && cpcHoje > 0) {
    metaCpc = cpcHoje;
    metaCpcFonte = 'media_dia';
  } else if (mediaSemanaCpc > 0) {
    metaCpc = mediaSemanaCpc;
    metaCpcFonte = 'media_semana';
  } else {
    metaCpc = metaDiaStore > 0 ? metaDiaStore : 35;
    metaCpcFonte = 'fallback_store';
  }

  const hAtual = Number(
    !horaAtual || horaAtual === 'todas' ? horaBrt() : horaAtual,
  );
  const inicio = Number(HORAS[0]);
  const horasDecorridas = Math.max(1, Math.min(HORAS.length, hAtual - inicio + 1));

  let expedienteHoras =
    horasAtivas.size >= 3
      ? clampExp(horasAtivas.size)
      : mediaSemanaVendas > 0
        ? clampExp(8)
        : clampExp(Math.max(horasAtivas.size, 6));

  // Ritmo: vendas/hora decorrida × expediente; piso = média semanal
  const ritmo = Math.round((vendasHoje / horasDecorridas) * expedienteHoras);
  let metaVendasDia = Math.max(1, ritmo);
  if (mediaSemanaVendas > 0) {
    // mistura 50/50 ritmo do dia × média recente (comportamento médio)
    metaVendasDia = Math.max(1, Math.round(ritmo * 0.5 + mediaSemanaVendas * 0.5));
  }
  if (vendasHoje === 0 && mediaSemanaVendas > 0) {
    metaVendasDia = Math.max(1, mediaSemanaVendas);
  }

  const { uteis, sabados } = diasDoMes(dataRef);
  const pesoTotal = uteis + sabados * 0.5;
  const metaVendasMesEquiv = Math.max(1, Math.round(metaVendasDia * Math.max(1, pesoTotal)));

  return {
    metaCpc,
    metaCpcFonte,
    metaVendasDia,
    metaVendasMesEquiv,
    expedienteHoras,
    limiarAlertaCpc: Math.round(metaCpc * BKO_ALERTA_FATOR * 10) / 10,
    vendasHoje,
    tabuladasHoje,
    cpcHoje,
  };
}

/** Meta CPC efetiva: BKO usa média dinâmica; demais usam store. */
export function resolveMetaCpcEfetiva(
  campanha: string,
  metaDiaStore: number,
  bkoRefs: BkoRefs | null,
): number {
  if (campanha === 'ACAO_BKO' && bkoRefs) return bkoRefs.limiarAlertaCpc;
  return metaDiaStore;
}
