/** Uma ficha por KPI do RR — dono, janela, fonte. UI e briefing leem daqui. */

export type RrKpiId =
  | 'gross_dia'
  | 'erro_dia'
  | 'portados_gross_dia'
  | 'portados_hoje_brt'
  | 'entregues_mes'
  | 'tim_mes'
  | 'crivo_dia'
  | 'eva_sucesso'
  | 'eva_meta'
  | 'eva_logados';

export type RrKpiFicha = {
  id: RrKpiId;
  label: string;
  definicao: string;
  janela: 'dia' | 'mes' | 'live' | 'hoje_brt';
  fonte: string;
  dono: string;
  universo: string;
};

export const RR_KPI_CATALOG: Record<RrKpiId, RrKpiFicha> = {
  gross_dia: {
    id: 'gross_dia',
    label: 'Gross',
    definicao: 'OS+ICCID · 1 proposta',
    janela: 'dia',
    fonte: 'sms_eficiencia',
    dono: 'Operações',
    universo: 'Portabilidade',
  },
  erro_dia: {
    id: 'erro_dia',
    label: 'Taxa de erro',
    definicao: 'Erro operacional / propostas',
    janela: 'dia',
    fonte: 'correcao_logs',
    dono: 'Qualidade',
    universo: 'Portabilidade',
  },
  portados_gross_dia: {
    id: 'portados_gross_dia',
    label: 'Portados (Gross dia)',
    definicao: 'Sucesso consolidado no Gross do dia',
    janela: 'dia',
    fonte: 'sms_eficiencia',
    dono: 'Operações',
    universo: 'Portabilidade',
  },
  portados_hoje_brt: {
    id: 'portados_hoje_brt',
    label: 'Portados hoje',
    definicao: 'Retorno TIM no dia BRT corrente',
    janela: 'hoje_brt',
    fonte: 'sms_eficiencia.retorno_atualizado_em',
    dono: 'Logística',
    universo: 'Portabilidade',
  },
  entregues_mes: {
    id: 'entregues_mes',
    label: 'Entregues',
    definicao: 'Entregue com/sem chip · cohort mês',
    janela: 'mes',
    fonte: 'portabilidade-funil',
    dono: 'Logística',
    universo: 'Portabilidade',
  },
  tim_mes: {
    id: 'tim_mes',
    label: 'Sucesso TIM',
    definicao: 'Portado + Falha Parcial',
    janela: 'mes',
    fonte: 'portabilidade-funil',
    dono: 'Logística',
    universo: 'Portabilidade',
  },
  crivo_dia: {
    id: 'crivo_dia',
    label: 'Tx aprovadas',
    definicao: 'Aprovadas / sucesso · iSize só em Port/Todas',
    janela: 'dia',
    fonte: 'EVA jornada | iSize Port',
    dono: 'Crivo',
    universo: 'recorte campanha',
  },
  eva_sucesso: {
    id: 'eva_sucesso',
    label: 'Vendas EVA',
    definicao: 'Sucesso tabulado · TODAS = Port+Mig',
    janela: 'live',
    fonte: 'eva-dash serie_hora',
    dono: 'Supervisão',
    universo: 'recorte comercial',
  },
  eva_meta: {
    id: 'eva_meta',
    label: '% meta do dia',
    definicao: 'Vendas vs meta projetada agora (não é falta se +)',
    janela: 'live',
    fonte: 'nowcast',
    dono: 'Supervisão',
    universo: 'recorte comercial',
  },
  eva_logados: {
    id: 'eva_logados',
    label: 'Logados',
    definicao: 'Ativos no recorte (TODAS exclui BKO)',
    janela: 'live',
    fonte: 'eva-dash ativas',
    dono: 'Supervisão',
    universo: 'recorte comercial',
  },
};

export function kpiFooter(id: RrKpiId): string {
  const k = RR_KPI_CATALOG[id];
  return `${k.definicao} · ${k.dono}`;
}
