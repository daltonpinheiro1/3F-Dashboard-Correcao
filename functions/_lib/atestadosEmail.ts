/** E-mail transacional de atestados — reutiliza infra CF Email das advertências. */

export type AtestadosEmailEnv = {
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  ADVERTENCIAS_EMAIL_FROM?: string;
  ADVERTENCIAS_EMAIL_ENABLED?: string;
  ADVERTENCIAS_EMAIL_REPLY_TO?: string;
  ATESTADOS_EMAIL_ENABLED?: string;
  ATESTADOS_EMAIL_FROM?: string;
  /** Destino extra para novos protocolos (ex.: dp@empresa.com). */
  ATESTADOS_EMAIL_DP?: string;
};

export function atestadosEmailConfigured(env: AtestadosEmailEnv): boolean {
  const enabled =
    env.ATESTADOS_EMAIL_ENABLED === 'true' || env.ADVERTENCIAS_EMAIL_ENABLED === 'true';
  const from = (env.ATESTADOS_EMAIL_FROM || env.ADVERTENCIAS_EMAIL_FROM || '').trim();
  return (
    enabled &&
    Boolean(env.CF_ACCOUNT_ID?.trim()) &&
    Boolean(env.CF_API_TOKEN?.trim()) &&
    Boolean(from)
  );
}

function parseFrom(raw: string): { address: string; name?: string } {
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { address: raw.trim() };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendAtestadoEmail(opts: {
  env: AtestadosEmailEnv;
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!atestadosEmailConfigured(opts.env)) {
    return { ok: false, skipped: true, error: 'E-mail não configurado (ATESTADOS_EMAIL_ENABLED).' };
  }
  const fromRaw = (opts.env.ATESTADOS_EMAIL_FROM || opts.env.ADVERTENCIAS_EMAIL_FROM)!;
  const from = parseFrom(fromRaw);
  const body: Record<string, unknown> = {
    from: { address: from.address, name: from.name || 'DP 3F' },
    to: opts.to.filter(Boolean).map((address) => ({ address })),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  if (opts.env.ADVERTENCIAS_EMAIL_REPLY_TO?.trim()) {
    body.reply_to = { address: opts.env.ADVERTENCIAS_EMAIL_REPLY_TO.trim() };
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.env.CF_ACCOUNT_ID}/email/sending/send`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string }[];
  };
  if (!r.ok || data.success === false) {
    return { ok: false, error: data.errors?.[0]?.message || `HTTP ${r.status}` };
  }
  return { ok: true };
}

export function buildProtocoloEmail(input: {
  protocolo: string;
  colaboradorNome: string;
  tipo: string;
  periodo: string;
  protocoladoPor: string;
  atestadosUrl?: string;
  arquivoPath?: string;
}) {
  const assunto = `[3F DP] Atestado protocolado — ${input.colaboradorNome} (${input.protocolo})`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5">
<p>Novo atestado <strong>${escHtml(input.protocolo)}</strong> protocolado para <strong>${escHtml(input.colaboradorNome)}</strong>.</p>
<ul>
  <li><strong>Tipo:</strong> ${escHtml(input.tipo)}</li>
  <li><strong>Período:</strong> ${escHtml(input.periodo)}</li>
  <li><strong>Protocolado por:</strong> ${escHtml(input.protocoladoPor)}</li>
  ${input.arquivoPath ? `<li><strong>Arquivo:</strong> ${escHtml(input.arquivoPath)}</li>` : ''}
</ul>
${input.atestadosUrl ? `<p><a href="${escHtml(input.atestadosUrl)}">Abrir Atestados</a></p>` : ''}
<p style="color:#666;font-size:12px">Mensagem automática — 3F Contact Center · DP</p>
</body></html>`;
  const text = [
    assunto,
    `Colaborador: ${input.colaboradorNome}`,
    `Tipo: ${input.tipo}`,
    `Período: ${input.periodo}`,
    `Por: ${input.protocoladoPor}`,
    input.arquivoPath ? `Arquivo: ${input.arquivoPath}` : '',
    input.atestadosUrl ? `Link: ${input.atestadosUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { assunto, html, text };
}

export function buildDecisaoEmail(input: {
  protocolo: string;
  colaboradorNome: string;
  status: 'aprovado' | 'recusado';
  analisadoPor: string;
  recusaMotivo?: string;
  atestadosUrl?: string;
}) {
  const verbo = input.status === 'aprovado' ? 'aprovado' : 'recusado';
  const assunto = `[3F DP] Atestado ${verbo} — ${input.colaboradorNome} (${input.protocolo})`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5">
<p>O atestado <strong>${escHtml(input.protocolo)}</strong> de <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>${verbo}</strong> por ${escHtml(input.analisadoPor)}.</p>
${input.recusaMotivo ? `<p><strong>Motivo:</strong> ${escHtml(input.recusaMotivo)}</p>` : ''}
${input.atestadosUrl ? `<p><a href="${escHtml(input.atestadosUrl)}">Abrir Atestados</a></p>` : ''}
<p style="color:#666;font-size:12px">Mensagem automática — 3F Contact Center · DP</p>
</body></html>`;
  const text = [
    assunto,
    `Analisado por: ${input.analisadoPor}`,
    input.recusaMotivo ? `Motivo: ${input.recusaMotivo}` : '',
    input.atestadosUrl ? `Link: ${input.atestadosUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { assunto, html, text };
}
