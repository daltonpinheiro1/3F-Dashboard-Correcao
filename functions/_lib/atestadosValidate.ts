/** Sanitização e transições de status — atestados. */

import { completarAnalisePeriodo } from './atestadosPeriodo';

export const ATESTADO_TIPOS = ['medico', 'odontologico', 'acompanhamento', 'declaracao', 'outro'] as const;
export const ATESTADO_STATUS = [
  'rascunho',
  'protocolado',
  'em_analise',
  'aprovado',
  'recusado',
  'arquivado',
] as const;
export const ATESTADO_UNIDADES = ['dias', 'horas'] as const;

const POST_ALLOWED = new Set([
  'colaborador_nome',
  'colaborador_matricula',
  'colaborador_cpf',
  'colaborador_cargo',
  'tipo',
  'unidade_periodo',
  'quantidade_dias',
  'quantidade_horas',
  'data_inicio',
  'data_fim',
  'cid',
  'medico_nome',
  'crm_uf',
  'status',
  'observacoes',
  'ia_analise',
  'ia_confianca',
  'arquivo_nome_original',
  'origem',
]);

const PATCH_ALLOWED = new Set([
  'tipo',
  'unidade_periodo',
  'quantidade_dias',
  'quantidade_horas',
  'data_inicio',
  'data_fim',
  'cid',
  'medico_nome',
  'crm_uf',
  'status',
  'observacoes',
  'recusa_motivo',
  'ia_analise',
  'ia_confianca',
  'analisado_por_email',
  'analisado_por_nome',
  'analisado_em',
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

function normDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function sanitizeAtestadoPost(payload: Record<string, unknown>): Record<string, unknown> {
  const row = pickAllowed(payload, POST_ALLOWED);
  const tipo = String(row.tipo || 'medico');
  row.tipo = ATESTADO_TIPOS.includes(tipo as (typeof ATESTADO_TIPOS)[number]) ? tipo : 'medico';
  const un = String(row.unidade_periodo || 'dias');
  row.unidade_periodo = ATESTADO_UNIDADES.includes(un as (typeof ATESTADO_UNIDADES)[number])
    ? un
    : 'dias';
  row.quantidade_dias = normNum(row.quantidade_dias);
  row.quantidade_horas = normNum(row.quantidade_horas);
  row.data_inicio = normDate(row.data_inicio);
  row.data_fim = normDate(row.data_fim);
  row.cid = String(row.cid || '').trim().slice(0, 12) || null;
  row.medico_nome = String(row.medico_nome || '').trim().slice(0, 200) || null;
  row.crm_uf = String(row.crm_uf || '').trim().slice(0, 24) || null;
  row.observacoes = String(row.observacoes || '').trim().slice(0, 4000) || null;
  const st = String(row.status || 'protocolado');
  row.status = ATESTADO_STATUS.includes(st as (typeof ATESTADO_STATUS)[number]) ? st : 'protocolado';
  if (row.ia_analise != null && typeof row.ia_analise !== 'object') {
    row.ia_analise = {};
  }
  if (row.ia_confianca != null) {
    const c = Number(row.ia_confianca);
    row.ia_confianca = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null;
  }
  row.arquivo_nome_original = String(row.arquivo_nome_original || '').trim().slice(0, 255) || null;
  const orig = String(row.origem || 'dp');
  row.origem = ['dp', 'supervisor', 'colaborador'].includes(orig) ? orig : 'dp';
  const completo = completarAnalisePeriodo({
    data_inicio: row.data_inicio as string | null,
    data_fim: row.data_fim as string | null,
    quantidade_dias: row.quantidade_dias as number,
    unidade_periodo: row.unidade_periodo as string,
  });
  row.data_fim = completo.data_fim ?? row.data_fim;
  row.quantidade_dias = completo.quantidade_dias ?? row.quantidade_dias;
  return row;
}

export function sanitizeAtestadoPatch(payload: Record<string, unknown>): Record<string, unknown> {
  const row = pickAllowed(payload, PATCH_ALLOWED);
  if (row.tipo != null) {
    const tipo = String(row.tipo);
    row.tipo = ATESTADO_TIPOS.includes(tipo as (typeof ATESTADO_TIPOS)[number]) ? tipo : 'medico';
  }
  if (row.unidade_periodo != null) {
    const un = String(row.unidade_periodo);
    row.unidade_periodo = ATESTADO_UNIDADES.includes(un as (typeof ATESTADO_UNIDADES)[number])
      ? un
      : 'dias';
  }
  if (row.quantidade_dias != null) row.quantidade_dias = normNum(row.quantidade_dias);
  if (row.quantidade_horas != null) row.quantidade_horas = normNum(row.quantidade_horas);
  if (row.data_inicio !== undefined) row.data_inicio = normDate(row.data_inicio);
  if (row.data_fim !== undefined) row.data_fim = normDate(row.data_fim);
  if (row.quantidade_dias != null || row.data_inicio !== undefined || row.data_fim !== undefined) {
    const completo = completarAnalisePeriodo({
      data_inicio: (row.data_inicio ?? undefined) as string | null | undefined,
      data_fim: (row.data_fim ?? undefined) as string | null | undefined,
      quantidade_dias: row.quantidade_dias != null ? normNum(row.quantidade_dias) : undefined,
      unidade_periodo: row.unidade_periodo != null ? String(row.unidade_periodo) : undefined,
    });
    if (completo.data_fim) row.data_fim = completo.data_fim;
    if (completo.quantidade_dias) row.quantidade_dias = completo.quantidade_dias;
  }
  if (row.cid !== undefined) row.cid = String(row.cid || '').trim().slice(0, 12) || null;
  if (row.medico_nome !== undefined) row.medico_nome = String(row.medico_nome || '').trim().slice(0, 200) || null;
  if (row.crm_uf !== undefined) row.crm_uf = String(row.crm_uf || '').trim().slice(0, 24) || null;
  if (row.observacoes !== undefined) row.observacoes = String(row.observacoes || '').trim().slice(0, 4000) || null;
  if (row.recusa_motivo !== undefined) row.recusa_motivo = String(row.recusa_motivo || '').trim().slice(0, 2000) || null;
  if (row.status != null) {
    const st = String(row.status);
    row.status = ATESTADO_STATUS.includes(st as (typeof ATESTADO_STATUS)[number]) ? st : undefined;
    if (!row.status) delete row.status;
  }
  if (row.ia_analise != null && typeof row.ia_analise !== 'object') delete row.ia_analise;
  if (row.ia_confianca != null) {
    const c = Number(row.ia_confianca);
    row.ia_confianca = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null;
  }
  return row;
}

const TRANSICOES: Record<string, Set<string>> = {
  rascunho: new Set(['protocolado', 'em_analise']),
  protocolado: new Set(['em_analise', 'aprovado', 'recusado', 'arquivado']),
  em_analise: new Set(['aprovado', 'recusado', 'arquivado']),
  aprovado: new Set(['arquivado']),
  recusado: new Set(['arquivado', 'em_analise']),
  arquivado: new Set([]),
};

export function validateAtestadoPost(
  row: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const nome = String(row.colaborador_nome || '').trim();
  if (nome.length < 3) return { ok: false, error: 'Informe o nome do colaborador (mín. 3 caracteres).' };
  const un = String(row.unidade_periodo || 'dias');
  if (un === 'dias' && normNum(row.quantidade_dias) <= 0 && !row.data_inicio) {
    return { ok: false, error: 'Informe dias de afastamento ou data de início.' };
  }
  if (un === 'horas' && normNum(row.quantidade_horas) <= 0) {
    return { ok: false, error: 'Informe a quantidade de horas.' };
  }
  return { ok: true };
}

export function validateAtestadoPatchTransition(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const from = String(current.status || 'protocolado');
  const to = patch.status != null ? String(patch.status) : from;
  if (to !== from) {
    const allowed = TRANSICOES[from];
    if (!allowed?.has(to)) {
      return { ok: false, error: `Transição de status inválida: ${from} → ${to}.` };
    }
    if ((to === 'aprovado' || to === 'recusado') && !patch.analisado_em) {
      return { ok: false, error: 'Decisão exige analisado_em (forçado pela sessão).' };
    }
    if (to === 'recusado' && !String(patch.recusa_motivo || current.recusa_motivo || '').trim()) {
      return { ok: false, error: 'Informe o motivo da recusa.' };
    }
  }
  return { ok: true };
}

export function applySessionActorsToAtestadoPatch(
  patch: Record<string, unknown>,
  user: { email: string; full_name?: string },
) {
  const st = patch.status != null ? String(patch.status) : '';
  if (st === 'aprovado' || st === 'recusado' || st === 'em_analise') {
    patch.analisado_por_email = user.email;
    patch.analisado_por_nome = user.full_name || user.email;
    patch.analisado_em = new Date().toISOString();
  }
}
