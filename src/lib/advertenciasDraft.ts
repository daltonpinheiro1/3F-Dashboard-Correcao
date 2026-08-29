import {
  nivelPorIdx,
  type Advertencia,
} from './advertenciasEscala';
import { entregaInicialPorStatus } from './advertenciasEntrega';
import { rotuloDocumentoSubmotivo } from './siscadMotivos';

export type AdvertenciaFormDraft = {
  nome: string;
  matricula: string;
  cpf: string;
  cargo: string;
  categoria: string;
  submotivo: string;
  motivoTexto: string;
  descricao: string;
  dataOcorrido: string;
  nivelIdx: number;
  userName: string;
  userEmail: string;
  obs: string;
  supervisorOp: string;
  justPulo: string;
  ciencia: boolean;
  t1n: string;
  t1c: string;
  t2n: string;
  t2c: string;
};

/** Motivo + submotivo Siscad bastam para montar a prévia (demais campos opcionais). */
export function canPreviewAdvertencia(categoria: string, submotivo: string): boolean {
  return Boolean(categoria.trim() && submotivo.trim());
}

/** Monta objeto no formato do PDF sem persistir no banco. */
export function buildAdvertenciaDraft(input: AdvertenciaFormDraft): Advertencia {
  const nivel = nivelPorIdx(input.nivelIdx);
  const motivoFinal = (input.motivoTexto || rotuloDocumentoSubmotivo(input.submotivo)).trim();
  const now = new Date().toISOString();

  return {
    id: '00000000-0000-4000-8000-000000000000',
    created_at: now,
    updated_at: now,
    colaborador_nome: input.nome.trim() || 'COLABORADOR (informar nome)',
    colaborador_matricula: input.matricula.trim() || null,
    colaborador_cpf: input.cpf.trim() || null,
    colaborador_cargo: input.cargo.trim() || 'Operador',
    colaborador_supervisor: input.supervisorOp.trim() || null,
    motivo_categoria: input.categoria,
    motivo_texto: motivoFinal,
    descricao:
      input.descricao.trim() ||
      '(Preencha a descrição do ocorrido antes de salvar. Esta linha não aparecerá no documento final se vazio.)',
    data_ocorrido: input.dataOcorrido,
    nivel_idx: nivel.idx,
    nivel_codigo: nivel.codigo,
    nivel_label: nivel.label,
    dias_suspensao: nivel.diasSuspensao,
    status: 'pendente',
    criado_por_email: input.userEmail,
    criado_por_nome: input.userName,
    entrega_status: entregaInicialPorStatus('pendente'),
    notificacao_status: 'desativada',
    observacoes_supervisor:
      [input.obs.trim(), input.supervisorOp ? `Supervisor EVA: ${input.supervisorOp}` : '']
        .filter(Boolean)
        .join('\n') || null,
    justificativa_pulo: input.justPulo.trim() || null,
    ciencia_colaborador: input.ciencia,
    testemunha1_nome: input.t1n.trim() || null,
    testemunha1_cpf: input.t1c.trim() || null,
    testemunha2_nome: input.t2n.trim() || null,
    testemunha2_cpf: input.t2c.trim() || null,
    anexos: [],
  };
}
