/**
 * Claim condicional da notificação de advertência: só quem vence o PATCH condicional envia o e-mail.
 * Modo `status` requer a migration 045 (status `enviando` + `notificacao_claim_em`); sem ela,
 * cai para compare-and-swap em `notificacao_tentativas`.
 */

const TABLE = 'advertencias';

export const NOTIFICACAO_CLAIM_STALE_MS = 5 * 60_000;

export type ClaimModo = 'status' | 'tentativas';

export type ClaimOpts = {
  id: string;
  force: boolean;
  tentativasAtual: number;
  agora?: Date;
};

export type ClaimResult =
  | { ok: true; modo: ClaimModo; row: Record<string, unknown> }
  | { ok: false; motivo: 'em_andamento' }
  | { ok: false; motivo: 'erro'; erro: string };

type Fetcher = (path: string, init: RequestInit) => Promise<Response>;

export function buildNotificacaoClaimPath(modo: ClaimModo, opts: ClaimOpts): string {
  const params = new URLSearchParams();
  params.set('id', `eq.${opts.id}`);
  if (modo === 'status') {
    const agora = (opts.agora ?? new Date()).getTime();
    const stale = new Date(agora - NOTIFICACAO_CLAIM_STALE_MS).toISOString();
    params.set(
      'or',
      opts.force
        ? `(notificacao_status.neq.enviando,notificacao_claim_em.lt."${stale}")`
        : `(notificacao_status.not.in.(enviada,enviando),and(notificacao_status.eq.enviando,notificacao_claim_em.lt."${stale}"))`,
    );
  } else {
    params.set('notificacao_tentativas', `eq.${opts.tentativasAtual}`);
    if (!opts.force) params.set('notificacao_status', 'neq.enviada');
  }
  return `/rest/v1/${TABLE}?${params.toString()}`;
}

export function buildNotificacaoClaimBody(modo: ClaimModo, opts: ClaimOpts): Record<string, unknown> {
  const agora = (opts.agora ?? new Date()).toISOString();
  const body: Record<string, unknown> = {
    notificacao_tentativas: opts.tentativasAtual + 1,
    updated_at: agora,
  };
  if (modo === 'status') {
    body.notificacao_status = 'enviando';
    body.notificacao_claim_em = agora;
  }
  return body;
}

/** 400 por coluna/status desconhecido = migration 045 ainda não aplicada. */
export function claimSemMigration(status: number, texto: string): boolean {
  if (status !== 400) return false;
  return /42703|PGRST204|23514|notificacao_claim_em|notificacao_status_check/i.test(texto);
}

async function tentar(fetcher: Fetcher, modo: ClaimModo, opts: ClaimOpts) {
  return fetcher(buildNotificacaoClaimPath(modo, opts), {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(buildNotificacaoClaimBody(modo, opts)),
  });
}

export async function claimNotificacao(fetcher: Fetcher, opts: ClaimOpts): Promise<ClaimResult> {
  let modo: ClaimModo = 'status';
  let r = await tentar(fetcher, modo, opts);
  if (!r.ok) {
    const t = await r.text();
    if (!claimSemMigration(r.status, t)) return { ok: false, motivo: 'erro', erro: `${r.status} ${t.slice(0, 180)}` };
    modo = 'tentativas';
    r = await tentar(fetcher, modo, opts);
    if (!r.ok) {
      const t2 = await r.text();
      return { ok: false, motivo: 'erro', erro: `${r.status} ${t2.slice(0, 180)}` };
    }
  }
  const rows = (await r.json().catch(() => [])) as Record<string, unknown>[];
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row ? { ok: true, modo, row } : { ok: false, motivo: 'em_andamento' };
}
