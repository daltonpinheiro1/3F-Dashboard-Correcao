/** Sanitização server-side — evita mass assignment em advertências. */

const POST_ALLOWED = new Set([
  'id',
  'colaborador_nome',
  'colaborador_matricula',
  'colaborador_cpf',
  'colaborador_cargo',
  'motivo_categoria',
  'motivo_texto',
  'descricao',
  'data_ocorrido',
  'nivel_idx',
  'nivel_codigo',
  'nivel_label',
  'dias_suspensao',
  'status',
  'observacoes_supervisor',
  'justificativa_pulo',
  'ciencia_colaborador',
  'testemunha1_nome',
  'testemunha1_cpf',
  'testemunha2_nome',
  'testemunha2_cpf',
  'anexos',
  'entrega_status',
  'notificacao_status',
]);

const PATCH_ALLOWED = new Set([
  'observacoes_supervisor',
  'descricao',
  'entrega_status',
  'impressa_em',
  'impressa_por_nome',
  'impressa_por_email',
  'entregue_em',
  'entregue_por_nome',
  'entregue_por_email',
  'entrega_modo',
  'entrega_observacao',
  'ciencia_colaborador',
  'testemunha1_nome',
  'testemunha1_cpf',
  'testemunha2_nome',
  'testemunha2_cpf',
  'status',
  'recusa_motivo',
  'aprovado_por_email',
  'aprovado_por_nome',
  'aprovado_em',
]);

export function pickAllowed(
  payload: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

export function sanitizeAdvertenciaPost(payload: Record<string, unknown>): Record<string, unknown> {
  const row = pickAllowed(payload, POST_ALLOWED);
  const dias = Number(row.dias_suspensao || 0);
  const status = String(row.status || 'pendente');
  // Suspensão não pode nascer aprovada sem fluxo DP
  if (dias > 0 && status === 'aprovada') {
    row.status = 'pendente';
    row.entrega_status = 'aguardando_aprovacao';
  } else if (status === 'aprovada') {
    row.entrega_status = row.entrega_status || 'aguardando_impressao';
  } else if (status === 'pendente') {
    row.entrega_status = row.entrega_status || 'aguardando_aprovacao';
  }
  row.notificacao_status = row.notificacao_status || 'desativada';
  return row;
}

export function sanitizeAdvertenciaPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const clean = pickAllowed(patch, PATCH_ALLOWED);
  // Campos de notificação só via /api/advertencia-notificar
  delete clean.notificacao_status;
  delete clean.notificacao_enviada_em;
  delete clean.notificacao_erro;
  delete clean.notificacao_tentativas;
  return clean;
}

export const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024;

export function validatePdfBase64(b64: string): { ok: true } | { ok: false; error: string } {
  if (!b64) return { ok: true };
  if (b64.length > MAX_PDF_BASE64_BYTES) {
    return { ok: false, error: 'PDF anexo grande demais (máx. ~5 MB).' };
  }
  try {
    const head = atob(b64.slice(0, 24));
    if (!head.startsWith('%PDF')) {
      return { ok: false, error: 'Anexo não é um PDF válido.' };
    }
  } catch {
    return { ok: false, error: 'Base64 do PDF inválido.' };
  }
  return { ok: true };
}
