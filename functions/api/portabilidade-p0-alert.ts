/**
 * POST /api/portabilidade-p0-alert
 * Dispara alerta Slack para oportunidades P0 (dedup 4h via KV).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import {
  buildP0SlackPayload,
  p0AlertConfigured,
  p0DedupKey,
  sendP0SlackAlert,
} from '../_lib/portabilidadeP0Alert';

type Env = EnvAuth &
  RateLimitEnv & {
    PORTABILIDADE_P0_ALERT_ENABLED?: string;
    PORTABILIDADE_SLACK_WEBHOOK_URL?: string;
    DASHBOARD_PUBLIC_URL?: string;
  };

type AlertaIn = {
  id?: string;
  prioridade?: string;
  titulo?: string;
  descricao?: string;
  valor?: number;
  acao?: string;
};

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-p0-alert', 60_000, 10))) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (!p0AlertConfigured(context.env)) {
    return json({ ok: true, enviado: false, motivo: 'Alertas P0 desligados ou webhook ausente.' });
  }

  let body: { mes?: string; alertas?: AlertaIn[] };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const mes = (body.mes || '').trim();
  const alertas = (body.alertas || []).filter((a) => a.prioridade === 'P0' && a.id && a.titulo);
  if (!mes || !alertas.length) {
    return json({ error: 'Informe mes e alertas P0.' }, 400);
  }

  const kv = context.env.RATE_LIMIT;
  const novos: AlertaIn[] = [];
  for (const a of alertas) {
    const key = p0DedupKey(mes, a.id!);
    if (kv) {
      const hit = await kv.get(key);
      if (hit) continue;
    }
    novos.push(a);
  }

  if (!novos.length) {
    return json({ ok: true, enviado: false, motivo: 'Alertas já enviados nesta janela (4h).' });
  }

  const payload = buildP0SlackPayload({
    mes,
    alertas: novos as AlertaIn[],
    dashboardUrl: context.env.DASHBOARD_PUBLIC_URL,
  });

  const sent = await sendP0SlackAlert(context.env, payload);
  if (!sent) {
    return json({ error: 'Falha ao enviar webhook Slack.' }, 502);
  }

  if (kv) {
    await Promise.all(
      novos.map((a) => kv.put(p0DedupKey(mes, a.id!), '1', { expirationTtl: 4 * 3600 })),
    );
  }

  return json({
    ok: true,
    enviado: true,
    quantidade: novos.length,
    ids: novos.map((a) => a.id),
  });
}
