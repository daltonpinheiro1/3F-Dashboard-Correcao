/** Escala pedagógica 3F — sequência imutável de progressão. */

export type AdvertenciaStatus =
  | 'pendente'
  | 'aprovada'
  | 'recusada'
  | 'executada'
  | 'cancelada';

export type NotificacaoStatus = 'desativada' | 'pendente' | 'enviada' | 'falha';

export type EntregaStatus =
  | 'aguardando_aprovacao'
  | 'aguardando_impressao'
  | 'impressa'
  | 'entregue'
  | 'recusada_ciencia';

export type EntregaModo =
  | 'assinatura_colaborador'
  | 'recusa_ciencia_testemunhas'
  | 'protocolo_dp';

export interface NivelEscala {
  idx: number;
  codigo: string;
  label: string;
  diasSuspensao: number;
  critico: boolean;
}

/** Ordem oficial (Feedback → … → Apuração DP). */
export const ESCALA_PEDAGOGICA: NivelEscala[] = [
  { idx: 0, codigo: 'feedback_formal', label: 'Feedback Formal', diasSuspensao: 0, critico: false },
  { idx: 1, codigo: 'advertencia_verbal', label: 'Advertência Verbal', diasSuspensao: 0, critico: false },
  { idx: 2, codigo: 'advertencia_escrita', label: 'Advertência Escrita', diasSuspensao: 0, critico: false },
  { idx: 3, codigo: 'suspensao_1', label: 'Suspensão de 1 dia', diasSuspensao: 1, critico: false },
  { idx: 4, codigo: 'advertencia_escrita', label: 'Advertência Escrita', diasSuspensao: 0, critico: false },
  { idx: 5, codigo: 'suspensao_2', label: 'Suspensão de 2 dias', diasSuspensao: 2, critico: false },
  { idx: 6, codigo: 'advertencia_escrita', label: 'Advertência Escrita', diasSuspensao: 0, critico: false },
  { idx: 7, codigo: 'suspensao_3', label: 'Suspensão de 3 dias', diasSuspensao: 3, critico: false },
  { idx: 8, codigo: 'advertencia_escrita', label: 'Advertência Escrita', diasSuspensao: 0, critico: false },
  { idx: 9, codigo: 'suspensao_5', label: 'Suspensão de 5 dias', diasSuspensao: 5, critico: true },
  {
    idx: 10,
    codigo: 'advertencia_ou_apuracao_dp',
    label: 'Advertência Escrita ou Apuração do DP',
    diasSuspensao: 0,
    critico: true,
  },
];

export const MOTIVOS_CATEGORIA = [
  'ATO DE IMPROBIDADE',
  'ATO DE INDISCIPLINA OU INSUBORDINACAO',
  'ATO EM DESACORDO COM O REGULAMENTO DA EMPRESA',
  'ATO LESIVO DA HONRA E BOA FAMA CONTRA CLIENTE',
  'ATO LESIVO DA HONRA E BOA FAMA CONTRA EMPREGADOR',
  'DESIDIA NO DESEMPENHO DAS FUNCOES',
  'INCONTINENCIA DE CONDUTA OU MAU PROCEDIMENTO',
] as const;

export type MotivoCategoria = (typeof MOTIVOS_CATEGORIA)[number];

/** Texto jurídico padrão do modelo oficial (CLT art. 482) — estrutura imutável. */
export const TEXTO_MODELO_OFICIAL = (motivo: string) =>
  `Nesta data, o colaborador foi orientado quanto à gravidade do ocorrido e conscientizado sobre a hipótese de rescisão do contrato de trabalho por justa causa caso haja a permanência de tais atos, conforme previsto no artigo 482 da CLT. Por ${motivo}, descumprindo o regulamento interno da empresa e legislação trabalhista, assim sirva a presente para adverti-lo, formalizando por escrito que o seu ato é contrário às normas da empresa.`;

export const TEXTO_RECUSA_CIENCIA =
  'Em virtude da recusa do empregado em dar ciência do recebimento desta comunicação, seu conteúdo foi lido e assinado pelas testemunhas:';

export const MESES_REINTEGRACAO = 6;

export function nivelPorIdx(idx: number): NivelEscala {
  return ESCALA_PEDAGOGICA[Math.max(0, Math.min(ESCALA_PEDAGOGICA.length - 1, idx))];
}

/**
 * Próximo nível sugerido = último nível aplicado (aprovada/executada) + 1.
 * Sem histórico → Feedback Formal (0).
 */
export function sugerirProximoNivel(historicoNivelIdx: number[]): number {
  if (!historicoNivelIdx.length) return 0;
  const max = Math.max(...historicoNivelIdx);
  return Math.min(max + 1, ESCALA_PEDAGOGICA.length - 1);
}

/** Bloqueia nível superior sem o anterior, salvo justificação (RH). */
export function podeAvancarNivel(
  nivelDesejado: number,
  historicoNivelIdx: number[],
  isRh: boolean,
  justificativaPulo: string,
): { ok: boolean; motivo?: string } {
  const sugerido = sugerirProximoNivel(historicoNivelIdx);
  if (nivelDesejado <= sugerido) return { ok: true };
  if (isRh && justificativaPulo.trim().length >= 20) return { ok: true };
  if (isRh) {
    return {
      ok: false,
      motivo: 'Para pular etapas, informe justificativa formal (mín. 20 caracteres).',
    };
  }
  return {
    ok: false,
    motivo: `Progressão bloqueada. Próximo nível permitido: ${nivelPorIdx(sugerido).label}.`,
  };
}

export function escalaCritica(nivelIdx: number): boolean {
  return nivelPorIdx(nivelIdx).critico;
}

/** Só suspensões (dias > 0) vão para aprovação do DP. Feedback/advertências já saem prontas p/ impressão. */
export function requerAprovacaoDp(nivelIdx: number): boolean {
  const n = nivelPorIdx(nivelIdx);
  return (n.diasSuspensao || 0) > 0 || /^suspensao_/i.test(n.codigo);
}

/** Reset sugerido após N meses sem ocorrências. */
export function sugerirReintegracao(ultimaDataIso: string | null, hoje = new Date()): boolean {
  if (!ultimaDataIso) return false;
  const ultima = new Date(ultimaDataIso);
  if (Number.isNaN(ultima.getTime())) return false;
  const meses =
    (hoje.getFullYear() - ultima.getFullYear()) * 12 + (hoje.getMonth() - ultima.getMonth());
  return meses >= MESES_REINTEGRACAO;
}

export interface Advertencia {
  id: string;
  created_at: string;
  updated_at?: string;
  colaborador_nome: string;
  colaborador_matricula?: string | null;
  colaborador_cpf?: string | null;
  colaborador_cargo?: string | null;
  motivo_categoria: string;
  motivo_texto: string;
  descricao: string;
  data_ocorrido: string;
  nivel_idx: number;
  nivel_codigo: string;
  nivel_label: string;
  dias_suspensao?: number;
  status: AdvertenciaStatus;
  criado_por_email?: string | null;
  criado_por_nome?: string | null;
  aprovado_por_email?: string | null;
  aprovado_por_nome?: string | null;
  aprovado_em?: string | null;
  recusa_motivo?: string | null;
  observacoes_supervisor?: string | null;
  justificativa_pulo?: string | null;
  ciencia_colaborador?: boolean;
  testemunha1_nome?: string | null;
  testemunha1_cpf?: string | null;
  testemunha2_nome?: string | null;
  testemunha2_cpf?: string | null;
  anexos?: unknown[];
  notificacao_status?: NotificacaoStatus;
  notificacao_enviada_em?: string | null;
  notificacao_erro?: string | null;
  notificacao_tentativas?: number;
  entrega_status?: EntregaStatus;
  impressa_em?: string | null;
  impressa_por_nome?: string | null;
  impressa_por_email?: string | null;
  entregue_em?: string | null;
  entregue_por_nome?: string | null;
  entregue_por_email?: string | null;
  entrega_modo?: EntregaModo | null;
  entrega_observacao?: string | null;
}

export type AdvertenciaCreate = Omit<Advertencia, 'id' | 'created_at' | 'updated_at'> & {
  status?: AdvertenciaStatus;
};
