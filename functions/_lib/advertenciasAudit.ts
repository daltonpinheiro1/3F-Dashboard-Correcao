/** Grava trilha imutável em advertencias_audit (best-effort após mutação). */

import { sbFetch, type EnvAuth, type SessionUser } from './auth';

const TABLE = 'advertencias_audit';

export type AuditActor = {
  mode: 'session' | 'secret';
  user?: SessionUser;
};

export type AuditWrite = {
  advertenciaId: string;
  action: string;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  patch?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

/** Remove campos pesados/sensíveis do patch antes de persistir. */
export function sanitizeAuditPatch(patch: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!patch) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'anexos' || k === 'pdf_base64' || k === 'narrativa_completa') continue;
    if (typeof v === 'string' && v.length > 2000) {
      out[k] = `${v.slice(0, 2000)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function resolveAuditAction(
  beforeStatus: string | null | undefined,
  patch: Record<string, unknown> | undefined,
  kind: 'create' | 'patch',
): string {
  if (kind === 'create') return 'create';
  const next = patch?.status != null ? String(patch.status) : null;
  if (next && next !== beforeStatus) {
    if (next === 'aprovada') return 'status_aprovada';
    if (next === 'recusada') return 'status_recusada';
    if (next === 'executada') return 'status_executada';
    if (next === 'cancelada') return 'status_cancelada';
    return `status_${next}`;
  }
  if (patch?.entrega_status != null) return 'entrega_update';
  if (patch?.notificacao_status != null) return 'notificacao_update';
  return 'patch';
}

export async function writeAdvertenciaAudit(
  env: EnvAuth,
  actor: AuditActor,
  entry: AuditWrite,
): Promise<void> {
  const row = {
    advertencia_id: entry.advertenciaId || null,
    action: entry.action,
    actor_email: actor.mode === 'session' ? actor.user?.email || null : null,
    actor_nome:
      actor.mode === 'session'
        ? actor.user?.full_name || actor.user?.email || null
        : 'server_secret',
    actor_mode: actor.mode,
    before_status: entry.beforeStatus ?? null,
    after_status: entry.afterStatus ?? null,
    patch: sanitizeAuditPatch(entry.patch),
    meta: entry.meta || {},
  };

  const r = await sbFetch(env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });

  if (!r.ok) {
    const t = await r.text();
    // Tabela ainda não migrada — não quebra o fluxo principal
    if (/PGRST205|Could not find the table|schema cache|advertencias_audit/i.test(t)) {
      console.warn('[advertencias_audit] tabela ausente — aplique migration 017');
      return;
    }
    console.warn('[advertencias_audit] falha ao gravar:', r.status, t.slice(0, 180));
  }
}
