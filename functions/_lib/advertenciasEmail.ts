/** Envio transacional via Cloudflare Email Service (REST). Estrutura pronta — secrets no Pages. */

export type AdvertenciasEmailEnv = {
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  ADVERTENCIAS_EMAIL_FROM?: string;
  ADVERTENCIAS_EMAIL_ENABLED?: string;
  ADVERTENCIAS_EMAIL_REPLY_TO?: string;
};

export function advertenciasEmailConfigured(env: AdvertenciasEmailEnv): boolean {
  return (
    env.ADVERTENCIAS_EMAIL_ENABLED === 'true' &&
    Boolean(env.CF_ACCOUNT_ID?.trim()) &&
    Boolean(env.CF_API_TOKEN?.trim()) &&
    Boolean(env.ADVERTENCIAS_EMAIL_FROM?.trim())
  );
}

function parseFrom(raw: string): { address: string; name?: string } {
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { address: raw.trim() };
}

export type NotificacaoEmailInput = {
  env: AdvertenciasEmailEnv;
  to: string;
  tipo: 'aprovada' | 'recusada';
  colaboradorNome: string;
  nivelLabel: string;
  motivoTexto: string;
  aprovadoPor: string;
  recusaMotivo?: string;
  pdfBase64?: string;
  dashboardUrl?: string;
};

export async function sendAdvertenciaNotificacao(
  input: NotificacaoEmailInput,
): Promise<{ ok: boolean; skipped?: boolean; error?: string; detail?: string }> {
  if (!advertenciasEmailConfigured(input.env)) {
    return { ok: false, skipped: true, error: 'E-mail não configurado no Pages (ADVERTENCIAS_EMAIL_ENABLED).' };
  }

  const from = parseFrom(input.env.ADVERTENCIAS_EMAIL_FROM!);
  const assunto =
    input.tipo === 'aprovada'
      ? `[3F RH] Suspensão aprovada — ${input.colaboradorNome}`
      : `[3F RH] Solicitação devolvida — ${input.colaboradorNome}`;

  const intro =
    input.tipo === 'aprovada'
      ? `A suspensão solicitada para <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>aprovada</strong> pelo DP.`
      : `A solicitação de medida disciplinar para <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>devolvida/recusada</strong> pelo DP.`;

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
<p>${intro}</p>
<ul>
  <li><strong>Nível:</strong> ${escHtml(input.nivelLabel)}</li>
  <li><strong>Motivo:</strong> ${escHtml(input.motivoTexto)}</li>
  <li><strong>Responsável DP:</strong> ${escHtml(input.aprovadoPor)}</li>
  ${
    input.tipo === 'recusada' && input.recusaMotivo
      ? `<li><strong>Motivo da devolução:</strong> ${escHtml(input.recusaMotivo)}</li>`
      : ''
  }
</ul>
${
  input.tipo === 'aprovada'
    ? `<p>O PDF oficial está em anexo. Após imprimir, registre a <strong>entrega/protocolo</strong> em Gestão de Advertências → Controle.</p>`
    : `<p>Acesse o dashboard para revisar e, se necessário, reenviar com ajustes.</p>`
}
${
  input.dashboardUrl
    ? `<p><a href="${escHtml(input.dashboardUrl)}">Abrir Gestão de Advertências</a></p>`
    : ''
}
<p style="color:#666;font-size:12px">Mensagem automática — 3F Contact Center · RH</p>
</body></html>`;

  const text = [
    input.tipo === 'aprovada' ? 'Suspensão aprovada.' : 'Solicitação devolvida.',
    `Colaborador: ${input.colaboradorNome}`,
    `Nível: ${input.nivelLabel}`,
    `Motivo: ${input.motivoTexto}`,
    `DP: ${input.aprovadoPor}`,
    input.recusaMotivo ? `Devolução: ${input.recusaMotivo}` : '',
    input.tipo === 'aprovada' ? 'PDF em anexo (se configurado).' : '',
    input.dashboardUrl ? `Dashboard: ${input.dashboardUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const body: Record<string, unknown> = {
    from: { address: from.address, name: from.name || 'RH 3F' },
    to: [{ address: input.to }],
    subject: assunto,
    html,
    text,
  };

  if (input.env.ADVERTENCIAS_EMAIL_REPLY_TO?.trim()) {
    body.reply_to = { address: input.env.ADVERTENCIAS_EMAIL_REPLY_TO.trim() };
  }

  if (input.tipo === 'aprovada' && input.pdfBase64) {
    body.attachments = [
      {
        filename: `advertencia_${slug(input.colaboradorNome)}.pdf`,
        content: input.pdfBase64,
        content_type: 'application/pdf',
      },
    ];
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${input.env.CF_ACCOUNT_ID}/email/sending/send`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await r.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string }[];
  };

  if (!r.ok || data.success === false) {
    const msg = data.errors?.[0]?.message || `HTTP ${r.status}`;
    return { ok: false, error: msg, detail: JSON.stringify(data).slice(0, 280) };
  }

  return { ok: true };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(s: string): string {
  return s.replace(/\s+/g, '_').replace(/[^\w.-]/g, '').slice(0, 48) || 'colaborador';
}
