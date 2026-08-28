import { sbFetch, type EnvAuth } from './auth';

const TABLE = 'atestados_audit';

export async function writeAtestadoAudit(
  env: EnvAuth,
  opts: {
    atestado_id: string;
    action: string;
    actor_email?: string;
    actor_nome?: string;
    payload?: Record<string, unknown>;
  },
) {
  const row = {
    atestado_id: opts.atestado_id,
    action: opts.action,
    actor_email: opts.actor_email || null,
    actor_nome: opts.actor_nome || null,
    payload: opts.payload || {},
    created_at: new Date().toISOString(),
  };
  await sbFetch(env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => null);
}
