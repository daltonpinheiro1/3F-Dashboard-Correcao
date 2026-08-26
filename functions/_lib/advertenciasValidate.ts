/** Sanitização server-side — evita mass assignment em advertências. */

const NIVEL_IDX_MAX = 10;
const NIVEL_APURACAO_IDX = 10;

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

/** Espelha requerAprovacaoDp do client — suspensão ou apuração jurídica (idx 10). */
export function requerAprovacaoDpFromRow(row: Record<string, unknown>): boolean {
  const idx = Number(row.nivel_idx ?? 0);
  const dias = Number(row.dias_suspensao || 0);
  const codigo = String(row.nivel_codigo || '');
  if (idx === NIVEL_APURACAO_IDX) return true;
  return dias > 0 || /^suspensao_/i.test(codigo);
}

export function sanitizeAdvertenciaPost(payload: Record<string, unknown>): Record<string, unknown> {
  const row = pickAllowed(payload, POST_ALLOWED);
  const nivelIdx = Number(row.nivel_idx ?? 0);
  if (Number.isFinite(nivelIdx)) {
    row.nivel_idx = Math.max(0, Math.min(NIVEL_IDX_MAX, nivelIdx));
  }
  const precisaDp = requerAprovacaoDpFromRow(row);
  const status = String(row.status || 'pendente');
  if (precisaDp) {
    row.status = 'pendente';
    row.entrega_status = 'aguardando_aprovacao';
    row.aprovado_por_email = null;
    row.aprovado_por_nome = null;
    row.aprovado_em = null;
  } else if (status === 'aprovada') {
    row.entrega_status = row.entrega_status || 'aguardando_impressao';
  } else if (status === 'pendente') {
    row.entrega_status = row.entrega_status || 'aguardando_aprovacao';
  }
  row.notificacao_status = row.notificacao_status || 'desativada';
  return row;
}

export function validateAdvertenciaPost(
  row: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const idx = Number(row.nivel_idx ?? 0);
  if (!Number.isFinite(idx) || idx < 0 || idx > NIVEL_IDX_MAX) {
    return { ok: false, error: 'nivel_idx inválido (0–10).' };
  }
  if (requerAprovacaoDpFromRow(row) && String(row.status) === 'aprovada') {
    return { ok: false, error: 'Suspensão ou apuração jurídica exige aprovação do DP.' };
  }
  const entrega = String(row.entrega_status || '');
  if (entrega === 'impressa' || entrega === 'entregue' || entrega === 'recusada_ciencia') {
    return { ok: false, error: 'Estado de entrega inválido na criação.' };
  }
  return { ok: true };
}

export function validateAdvertenciaPatchTransition(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const curStatus = String(current.status || '');
  const curEntrega = String(current.entrega_status || '');

  if (patch.status === 'aprovada' && curStatus !== 'pendente') {
    return { ok: false, error: 'Só é possível aprovar advertência pendente.' };
  }
  if (patch.status === 'recusada') {
    if (curStatus !== 'pendente') {
      return { ok: false, error: 'Só é possível recusar advertência pendente.' };
    }
    if (!String(patch.recusa_motivo || '').trim()) {
      return { ok: false, error: 'Motivo da recusa é obrigatório.' };
    }
  }

  if (patch.status === 'aprovada' && (patch.entrega_status === 'entregue' || patch.entrega_status === 'recusada_ciencia')) {
    return { ok: false, error: 'Não é permitido pular etapas de entrega.' };
  }

  if (patch.entrega_status === 'impressa') {
    if (curStatus !== 'aprovada') {
      return { ok: false, error: 'Impressão só após aprovação do DP.' };
    }
    if (curEntrega && curEntrega !== 'aguardando_impressao') {
      return { ok: false, error: 'Estado de entrega inválido para marcar impresso.' };
    }
  }

  if (patch.entrega_status === 'entregue' || patch.entrega_status === 'recusada_ciencia') {
    if (curStatus !== 'aprovada') {
      return { ok: false, error: 'Entrega só após aprovação.' };
    }
    if (curEntrega !== 'impressa') {
      return { ok: false, error: 'Registre impressão antes de confirmar entrega.' };
    }
  }

  return { ok: true };
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
