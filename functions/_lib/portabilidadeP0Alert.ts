/**
 * Alertas P0 → Slack webhook (opcional).
 */

export type P0AlertResumo = {
  id: string;
  prioridade?: string;
  titulo: string;
  descricao?: string;
  valor?: number;
  acao?: string;
};
export type P0AlertEnv = {
  PORTABILIDADE_P0_ALERT_ENABLED?: string;
  PORTABILIDADE_SLACK_WEBHOOK_URL?: string;
  DASHBOARD_PUBLIC_URL?: string;
};

export function p0AlertConfigured(env: P0AlertEnv): boolean {
  return (
    env.PORTABILIDADE_P0_ALERT_ENABLED === 'true' &&
    Boolean(env.PORTABILIDADE_SLACK_WEBHOOK_URL?.trim())
  );
}

export function buildP0SlackPayload(opts: {
  mes: string;
  alertas: P0AlertResumo[];
  dashboardUrl?: string;
}) {
  const base = (opts.dashboardUrl || 'https://3f-dashboard-correcao.pages.dev').replace(/\/$/, '');
  const lines = opts.alertas.map(
    (a) =>
      `• *${a.titulo}*${a.valor != null ? ` (${a.valor})` : ''}\n  ${a.descricao}${a.acao ? `\n  → ${a.acao}` : ''}`,
  );
  return {
    text: `🚨 Portabilidade P0 · cohort ${opts.mes}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🚨 ${opts.alertas.length} alerta(s) P0 · ${opts.mes}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n\n') },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Abrir Disparos' },
            url: `${base}/disparos`,
          },
        ],
      },
    ],
  };
}

export async function sendP0SlackAlert(
  env: P0AlertEnv,
  payload: ReturnType<typeof buildP0SlackPayload>,
): Promise<boolean> {
  const url = env.PORTABILIDADE_SLACK_WEBHOOK_URL?.trim();
  if (!url) return false;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.ok;
}

/** Chave dedup KV — 1 alerta por id/mês a cada 4h. */
export function p0DedupKey(mes: string, alertaId: string): string {
  const bucket = Math.floor(Date.now() / (4 * 3600_000));
  return `p0:${mes}:${alertaId}:${bucket}`;
}
