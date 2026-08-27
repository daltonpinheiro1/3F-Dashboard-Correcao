/** Sanitização server-side — evita mass assignment em advertências. */

const NIVEL_IDX_MAX = 10;
const NIVEL_APURACAO_IDX = 10;

/** Espelho da escala pedagógica (client: advertenciasEscala.ts). */
const NIVEL_META: Record<number, { codigo: string; label: string; dias: number }> = {
  0: { codigo: 'feedback_formal', label: 'Feedback Formal', dias: 0 },
  1: { codigo: 'advertencia_verbal', label: 'Advertência Verbal', dias: 0 },
  2: { codigo: 'advertencia_escrita', label: 'Advertência Escrita', dias: 0 },
  3: { codigo: 'suspensao_1', label: 'Suspensão de 1 dia', dias: 1 },
  4: { codigo: 'advertencia_escrita', label: 'Advertência Escrita', dias: 0 },
  5: { codigo: 'suspensao_2', label: 'Suspensão de 2 dias', dias: 2 },
  6: { codigo: 'advertencia_escrita', label: 'Advertência Escrita', dias: 0 },
  7: { codigo: 'suspensao_3', label: 'Suspensão de 3 dias', dias: 3 },
  8: { codigo: 'advertencia_escrita', label: 'Advertência Escrita', dias: 0 },
  9: { codigo: 'suspensao_5', label: 'Suspensão de 5 dias', dias: 5 },
  10: {
    codigo: 'advertencia_ou_apuracao_dp',
    label: 'Advertência Escrita ou Apuração do DP',
    dias: 0,
  },
};

export function syncNivelFields(row: Record<string, unknown>): Record<string, unknown> {
  if (row.nivel_idx == null) return row;
  const idx = Math.max(0, Math.min(NIVEL_IDX_MAX, Number(row.nivel_idx)));
  if (!Number.isFinite(idx)) return row;
  const meta = NIVEL_META[idx];
  if (!meta) return row;
  row.nivel_idx = idx;
  row.nivel_codigo = meta.codigo;
  row.nivel_label = meta.label;
  row.dias_suspensao = meta.dias;
  return row;
}

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
  /** DP pode reformular medida ao aprovar/recusar. */
  'nivel_idx',
  'nivel_codigo',
  'nivel_label',
  'dias_suspensao',
  /** Snapshot da medida original (preenchido na decisão DP). */
  'nivel_solicitado_idx',
  'nivel_solicitado_codigo',
  'nivel_solicitado_label',
  'dias_suspensao_solicitados',
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
  syncNivelFields(row);
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

  const nivelTouched =
    patch.nivel_idx != null ||
    patch.nivel_codigo != null ||
    patch.nivel_label != null ||
    patch.dias_suspensao != null;

  if (nivelTouched) {
    if (curStatus !== 'pendente') {
      return { ok: false, error: 'Só é possível reformular a medida enquanto pendente no DP.' };
    }
    const nextStatus = patch.status != null ? String(patch.status) : curStatus;
    if (nextStatus !== 'aprovada' && nextStatus !== 'recusada') {
      return {
        ok: false,
        error: 'Reformulação de medida só junto com aprovação ou recusa do DP.',
      };
    }
    if (patch.nivel_idx != null) {
      const idx = Number(patch.nivel_idx);
      if (!Number.isFinite(idx) || idx < 0 || idx > NIVEL_IDX_MAX) {
        return { ok: false, error: 'nivel_idx inválido (0–10).' };
      }
    }
  }

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

  // Máquina de estados — bloqueia saltos/regressões de status
  if (patch.status != null) {
    const next = String(patch.status);
    if (next !== curStatus) {
      const allowed: Record<string, string[]> = {
        pendente: ['aprovada', 'recusada', 'cancelada'],
        aprovada: ['executada', 'cancelada'],
        recusada: [],
        executada: [],
        cancelada: [],
      };
      const okNext = (allowed[curStatus] || []).includes(next);
      if (!okNext) {
        return { ok: false, error: `Transição de status inválida: ${curStatus} → ${next}.` };
      }
    }
  }

  if (curEntrega === 'entregue' || curEntrega === 'recusada_ciencia') {
    if (patch.entrega_status != null && String(patch.entrega_status) !== curEntrega) {
      return { ok: false, error: 'Entrega já finalizada — não é possível alterar.' };
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
  // Atores sempre vêm da sessão no handler — ignora spoof do client
  delete clean.aprovado_por_email;
  delete clean.aprovado_por_nome;
  delete clean.aprovado_em;
  delete clean.impressa_por_email;
  delete clean.impressa_por_nome;
  delete clean.entregue_por_email;
  delete clean.entregue_por_nome;
  if (clean.nivel_idx != null) {
    syncNivelFields(clean);
  } else {
    delete clean.nivel_codigo;
    delete clean.nivel_label;
    delete clean.dias_suspensao;
  }
  // Snapshot solicitado: só índices válidos; não sobrescrever meta do nível vigente
  if (clean.nivel_solicitado_idx != null) {
    const sIdx = Math.max(0, Math.min(NIVEL_IDX_MAX, Number(clean.nivel_solicitado_idx)));
    if (Number.isFinite(sIdx)) {
      const meta = NIVEL_META[sIdx];
      clean.nivel_solicitado_idx = sIdx;
      if (meta) {
        clean.nivel_solicitado_codigo = meta.codigo;
        clean.nivel_solicitado_label = meta.label;
        clean.dias_suspensao_solicitados = meta.dias;
      }
    } else {
      delete clean.nivel_solicitado_idx;
      delete clean.nivel_solicitado_codigo;
      delete clean.nivel_solicitado_label;
      delete clean.dias_suspensao_solicitados;
    }
  }
  return clean;
}

/**
 * Preenche atores e timestamps a partir da sessão autenticada.
 * Retorna o patch mutado (mesmo objeto).
 */
export function applySessionActorsToPatch(
  patch: Record<string, unknown>,
  user: { email: string; full_name?: string },
  nowIso = new Date().toISOString(),
): Record<string, unknown> {
  const nome = user.full_name || user.email;
  if (patch.status === 'aprovada' || patch.status === 'recusada') {
    patch.aprovado_por_email = user.email;
    patch.aprovado_por_nome = nome;
    patch.aprovado_em = nowIso;
    if (patch.status === 'aprovada') {
      patch.entrega_status = patch.entrega_status || 'aguardando_impressao';
      patch.notificacao_status = patch.notificacao_status || 'pendente';
    }
    if (patch.status === 'recusada') {
      patch.notificacao_status = patch.notificacao_status || 'pendente';
    }
  }
  if (patch.entrega_status === 'impressa') {
    patch.impressa_por_email = user.email;
    patch.impressa_por_nome = nome;
    if (!patch.impressa_em) patch.impressa_em = nowIso;
  }
  if (patch.entrega_status === 'entregue' || patch.entrega_status === 'recusada_ciencia') {
    patch.entregue_por_email = user.email;
    patch.entregue_por_nome = nome;
    if (!patch.entregue_em) patch.entregue_em = nowIso;
  }
  return patch;
}

/** Optimistic lock: status e/ou entrega_status esperados no PATCH. */
export function resolvePatchLock(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): { ifStatus?: string; ifEntregaStatus?: string } {
  const curStatus = String(current.status || '');
  const curEntrega = String(current.entrega_status || '');
  let ifStatus: string | undefined;
  let ifEntregaStatus: string | undefined;

  if (
    (patch.status === 'aprovada' || patch.status === 'recusada') &&
    curStatus === 'pendente'
  ) {
    ifStatus = 'pendente';
  }
  if (patch.entrega_status === 'impressa' && curEntrega === 'aguardando_impressao') {
    ifEntregaStatus = 'aguardando_impressao';
  }
  if (
    (patch.entrega_status === 'entregue' || patch.entrega_status === 'recusada_ciencia') &&
    curEntrega === 'impressa'
  ) {
    ifEntregaStatus = 'impressa';
  }
  return { ifStatus, ifEntregaStatus };
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
