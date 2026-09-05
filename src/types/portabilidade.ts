/** Tipos compartilhados — aba Disparos / portabilidade. */

export type AcaoDisparo = {
  concluidas_hoje: number;
  falha_hoje: number;
  bko_hoje: number;
  enfileiradas_hoje: number;
  pendentes_vencidos: number;
  pendentes_agendados: number;
  pendentes_janela_08h_hoje: number;
  pendentes_janela_08h_amanha: number;
};

export type DisparosPayload = {
  ok?: boolean;
  error?: string;
  timestamp?: string;
  matrix_version?: string;
  matrix_version_tag?: string;
  taxa_sucesso_hoje?: string | null;
  execucoes_hoje?: number | null;
  periodo?: { mes?: string | null; escopo?: string; label?: string };
  disparos_dia?: {
    nota?: string;
    agora_utc?: string;
    por_acao?: Record<string, AcaoDisparo>;
  } | null;
  totais?: Record<string, number> | null;
  totais_ao_vivo?: Record<string, number> | null;
  totais_mes?: Record<string, number> | null;
  pendentes_por_idade?: Record<string, number> | null;
};

export type MatrixCountRow = { label: string; count: number };

export type MatrixPayload = {
  ok?: boolean;
  error?: string;
  dias?: number;
  matrix_version?: string;
  matrix_version_tag?: string;
  total_retornos?: number;
  decisoes?: MatrixCountRow[];
  motivos?: MatrixCountRow[];
  canceladas?: {
    total_executados: number;
    motivo_recusa: MatrixCountRow[];
    categorias: Record<string, number>;
  };
};

export type Fatia = {
  id: string;
  label: string;
  grupo: string;
  cor: string;
  descricao: string;
  count: number;
  pct: number;
};

export type FunilPayload = {
  ok?: boolean;
  error?: string;
  gerado_em?: string;
  periodo?: {
    mes?: string;
    modo?: string;
    label?: string;
    definicao_metrica?: string;
  };
  gerencial?: {
    taxa_sucesso_tim_pct?: number;
    taxa_sucesso_tim_sobre_fechados_pct?: number;
    sucesso_tim?: number;
    taxa_portado_pct?: number;
    taxa_falha_parcial_pct?: number;
    taxa_quebra_pct?: number;
    taxa_em_voo_pct?: number;
    taxa_fechamento_pct?: number;
    taxa_cancelamento_pct?: number;
    taxa_portado_sobre_fechados_pct?: number;
    taxa_os_pct?: number;
    taxa_ticket_pct?: number;
    portados?: number;
    falha_parcial?: number;
    canceladas?: number;
    fechados?: number;
    quebras?: number;
    bko?: number;
    com_os?: number;
    com_ticket?: number;
  };
  reconciliacao?: {
    universo: number;
    soma_fatias: number;
    soma_grupos?: number;
    /** Cada proposta_isize conta no máximo uma vez no funil. */
    dedup_por_proposta?: boolean;
    propostas_unicas?: number;
    fecha: boolean;
    confianca?: 'completa' | 'parcial';
    truncamentos?: string[];
    em_voo: number;
    fechados: number;
    orfaos: number;
    cobertura_cap?: { ce_lidas: number; ag_lidas: number; fila_lidas: number; nota?: string };
  };
  estagios?: {
    id: string;
    label: string;
    valor: number;
    pct?: number;
    exclusivo?: boolean;
    fatias?: string[];
  }[];
  funil_conversao?: {
    id: string;
    label: string;
    valor: number;
    pct?: number;
    pct_fechados?: number;
  }[];
  funil_exclusivo?: { id: string; label: string; valor: number; pct?: number }[];
  funil_pontes?: {
    sem_os: number;
    os_sem_ticket: number;
    ticket_nao_fechado: number;
    nota?: string;
  };
  logistica_painel?: {
    total: number;
    nota?: string;
    segmentos: Array<{
      id: string;
      fatia: string;
      label: string;
      count: number;
      pct: number;
      cor: string;
      hint: string;
    }>;
  };
  fatias?: Fatia[];
  tickets?: { label: string; count: number }[];
  ordens?: { label: string; count: number }[];
  logistica?: { label: string; count: number }[];
  motivos?: { label: string; count: number }[];
  cancelamentos?: { label: string; count: number }[];
  meta_mes?: {
    mes: string;
    portados_pct: number;
    meta_portados: number | null;
    universo: number | null;
    fonte: 'default' | 'json' | 'env' | 'absoluto' | null;
  };
};

export type FatiaItem = {
  proposta: string;
  fatia: string;
  order_number?: string | null;
  order_status?: string | null;
  ticket_status?: string | null;
  ticket_number?: string | null;
  tem_iccid: boolean;
  iccid_label?: string | null;
  esim?: boolean;
  logistica?: string | null;
  fila?: string | null;
  motivo_recusar?: string | null;
  cancelamento?: string | null;
  updated_at?: string | null;
};

export type StratRow = { label: string; count: number };

export type HistoricoPonto = {
  mes: string;
  portados: number;
  falha_parcial: number;
  canceladas: number;
  fechados: number;
  sucesso_tim?: number;
  universo?: number | null;
  quebras: number;
  bko: number;
  execucoes: number;
  activate_ok: number;
  taxa_portado_pct: number;
  taxa_sucesso_tim_pct?: number | null;
  taxa_sucesso_fila_pct: number;
  fonte?: string;
};

export type HistoricoPayload = {
  ok?: boolean;
  error?: string;
  serie?: HistoricoPonto[];
  comparativo?: {
    vs_mes_anterior: {
      portados: number;
      quebras: number;
      bko: number;
      taxa_portado_pct: number;
      execucoes: number;
    };
    mes_atual: string;
    mes_anterior: string;
  } | null;
};

export type JourneyState = {
  resumo?: Record<string, unknown>;
  timeline?: Array<{ ts: string; fonte: string; titulo: string; detalhe?: string; status?: string }>;
  error?: string;
} | null;

export type CmpMes = {
  mes_atual: string;
  mes_anterior: string;
  portados: number;
  quebras: number;
  bko: number;
  fechados: number;
  canceladas: number;
  taxa_portado_pct: number;
  execucoes: number;
} | null;

export type ModoDisparos = 'operacional' | 'gerencial';
