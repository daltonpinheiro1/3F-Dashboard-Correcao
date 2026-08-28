/** Tipos e rótulos — gestão de atestados. */

export type AtestadoTipo = 'medico' | 'odontologico' | 'acompanhamento' | 'declaracao' | 'outro';
export type AtestadoStatus =
  | 'rascunho'
  | 'protocolado'
  | 'em_analise'
  | 'aprovado'
  | 'recusado'
  | 'arquivado';
export type AtestadoUnidade = 'dias' | 'horas';

export type IaRequisitos = {
  periodo: boolean;
  cid: boolean;
  tipo_documento: boolean;
  nome_medico: boolean;
  crm: boolean;
  assinatura_carimbo: boolean;
  nome_paciente: boolean;
};

export type IaAnalise = {
  tipo?: string;
  unidade_periodo?: AtestadoUnidade;
  quantidade_dias?: number;
  quantidade_horas?: number;
  data_inicio?: string | null;
  data_fim?: string | null;
  cid?: string | null;
  medico_nome?: string | null;
  crm_uf?: string | null;
  colaborador_nome_detectado?: string | null;
  requisitos?: IaRequisitos;
  alertas?: string[];
  resumo?: string;
  confianca?: number;
  modelo?: string;
  analisado_em?: string;
};

export interface Atestado {
  id: string;
  created_at: string;
  updated_at: string;
  protocolo: string;
  colaborador_nome: string;
  colaborador_matricula?: string | null;
  colaborador_cpf?: string | null;
  colaborador_cargo?: string | null;
  tipo: AtestadoTipo;
  unidade_periodo: AtestadoUnidade;
  quantidade_dias?: number;
  quantidade_horas?: number;
  data_inicio?: string | null;
  data_fim?: string | null;
  cid?: string | null;
  medico_nome?: string | null;
  crm_uf?: string | null;
  status: AtestadoStatus;
  observacoes?: string | null;
  recusa_motivo?: string | null;
  arquivo_path?: string | null;
  arquivo_thumb_path?: string | null;
  arquivo_mime?: string | null;
  arquivo_nome_original?: string | null;
  arquivo_tamanho_bytes?: number | null;
  ia_analise?: IaAnalise;
  ia_confianca?: number | null;
  criado_por_email?: string | null;
  criado_por_nome?: string | null;
  analisado_por_email?: string | null;
  analisado_por_nome?: string | null;
  analisado_em?: string | null;
  arquivo_hash_sha256?: string | null;
  origem?: 'dp' | 'supervisor' | 'colaborador' | null;
}

export type AtestadoCreate = Omit<
  Atestado,
  'id' | 'created_at' | 'updated_at' | 'protocolo' | 'analisado_por_email' | 'analisado_por_nome' | 'analisado_em'
> & {
  imagem_base64?: string;
};

export const ORIGEM_LABELS: Record<string, string> = {
  dp: 'DP / RH',
  supervisor: 'Solicitação supervisor',
  colaborador: 'Colaborador',
};

export const TIPO_LABELS: Record<AtestadoTipo, string> = {
  medico: 'Médico',
  odontologico: 'Odontológico',
  acompanhamento: 'Acompanhamento',
  declaracao: 'Declaração',
  outro: 'Outro',
};

export const STATUS_LABELS: Record<AtestadoStatus, string> = {
  rascunho: 'Rascunho',
  protocolado: 'Protocolado',
  em_analise: 'Em análise',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  arquivado: 'Arquivado',
};

export const STATUS_CHIP: Record<AtestadoStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-700',
  protocolado: 'bg-blue-100 text-blue-800',
  em_analise: 'bg-amber-100 text-amber-900',
  aprovado: 'bg-emerald-100 text-emerald-800',
  recusado: 'bg-red-100 text-red-800',
  arquivado: 'bg-slate-100 text-slate-700',
};

export function requisitosCompletos(req?: IaRequisitos): boolean {
  if (!req) return false;
  return req.periodo && req.nome_paciente && req.nome_medico && req.assinatura_carimbo;
}

export function scoreRequisitos(req?: IaRequisitos): number {
  if (!req) return 0;
  const keys = Object.keys(req) as (keyof IaRequisitos)[];
  const ok = keys.filter((k) => req[k]).length;
  return Math.round((ok / keys.length) * 100);
}
