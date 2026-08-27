/**
 * POST /api/advertencia-notificar
 * Envia e-mail ao solicitante (criado_por_email) quando suspensão é aprovada/recusada.
 * PDF opcional em base64 (gerado no browser na aprovação).
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { validatePdfBase64 } from '../_lib/advertenciasValidate';
import {
  advertenciasEmailConfigured,
  extractDecisaoDp,
  sendAdvertenciaNotificacao,
  type AdvertenciasEmailEnv,
} from '../_lib/advertenciasEmail';
import { writeAdvertenciaAudit } from '../_lib/advertenciasAudit';

type Env = EnvAuth & AdvertenciasEmailEnv;

const hits = new Map<string, number[]>();
const TABLE = 'advertencias';

async function loadRow(env: Env, id: string): Promise<Record<string, unknown> | null> {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!r.ok) return null;
  const rows = (await r.json()) as Record<string, unknown>[];
  return rows[0] || null;
}

async function patchNotificacao(env: Env, id: string, patch: Record<string, unknown>) {
  await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 20)) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let payload: { id?: string; pdf_base64?: string; force?: boolean };
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const id = String(payload.id || '').trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const row = await loadRow(context.env, id);
  if (!row) return json({ error: 'Registro não encontrado.' }, 404);

  const status = String(row.status || '');
  if (status !== 'aprovada' && status !== 'recusada') {
    return json({ error: 'Notificação só para status aprovada ou recusada.' }, 400);
  }

  const to = String(row.criado_por_email || '').trim();
  if (!to) {
    return json({ error: 'Solicitante sem e-mail (criado_por_email).' }, 400);
  }

  const notifStatus = String(row.notificacao_status || '');
  if (notifStatus === 'enviada' && !payload.force) {
    return json({ ok: true, skipped: true, message: 'Notificação já enviada.' });
  }

  const actor = { mode: auth.mode, user: auth.user };
  const auditNotif = async (statusAfter: string, meta?: Record<string, unknown>) => {
    await writeAdvertenciaAudit(context.env, actor, {
      advertenciaId: id,
      action: 'notificacao_update',
      beforeStatus: status,
      afterStatus: status,
      patch: { notificacao_status: statusAfter },
      meta,
    });
  };

  if (!advertenciasEmailConfigured(context.env)) {
    await patchNotificacao(context.env, id, {
      notificacao_status: 'desativada',
      notificacao_erro: 'Configure ADVERTENCIAS_EMAIL_* no Pages.',
    });
    await auditNotif('desativada', { reason: 'email_not_configured' });
    return json({
      ok: false,
      skipped: true,
      message: 'E-mail desativado — configure ADVERTENCIAS_EMAIL_ENABLED e credenciais CF.',
    });
  }

  const pdfRaw = status === 'aprovada' ? String(payload.pdf_base64 || '').trim() : '';
  if (pdfRaw) {
    const pdfCheck = validatePdfBase64(pdfRaw);
    if (!pdfCheck.ok) return json({ error: pdfCheck.error }, 400);
  }

  const tentativas = Number(row.notificacao_tentativas || 0) + 1;
  const origin = new URL(context.request.url).origin;
  const nivelSolicitadoLabel = String(row.nivel_solicitado_label || '').trim();
  const decisaoDp = extractDecisaoDp(String(row.observacoes_supervisor || ''));
  const result = await sendAdvertenciaNotificacao({
    env: context.env,
    to,
    tipo: status === 'aprovada' ? 'aprovada' : 'recusada',
    colaboradorNome: String(row.colaborador_nome || ''),
    nivelLabel: String(row.nivel_label || ''),
    nivelCodigo: String(row.nivel_codigo || ''),
    motivoTexto: String(row.motivo_texto || row.motivo_categoria || ''),
    aprovadoPor: String(row.aprovado_por_nome || row.aprovado_por_email || 'DP'),
    recusaMotivo: String(row.recusa_motivo || ''),
    nivelSolicitadoLabel: nivelSolicitadoLabel || undefined,
    diasSuspensao: Number(row.dias_suspensao || 0) || undefined,
    diasSolicitados: Number(row.dias_suspensao_solicitados || 0) || undefined,
    decisaoDp: decisaoDp || undefined,
    pdfBase64: pdfRaw || undefined,
    dashboardUrl: `${origin}/advertencias`,
    controleDpUrl: `${origin}/controle-dp`,
  });

  if (result.skipped) {
    await patchNotificacao(context.env, id, {
      notificacao_status: 'desativada',
      notificacao_erro: result.error || null,
      notificacao_tentativas: tentativas,
    });
    await auditNotif('desativada', { reason: 'send_skipped' });
    return json({ ok: false, skipped: true, error: result.error });
  }

  if (!result.ok) {
    await patchNotificacao(context.env, id, {
      notificacao_status: 'falha',
      notificacao_erro: result.error || 'Falha desconhecida',
      notificacao_tentativas: tentativas,
    });
    await auditNotif('falha', { reason: result.error });
    return json({ ok: false, error: result.error, detalhe: result.detail }, 502);
  }

  await patchNotificacao(context.env, id, {
    notificacao_status: 'enviada',
    notificacao_enviada_em: new Date().toISOString(),
    notificacao_erro: null,
    notificacao_tentativas: tentativas,
  });
  await auditNotif('enviada');

  return json({ ok: true, to, tipo: status });
}
