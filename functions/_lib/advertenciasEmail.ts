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

export type MedidaKind = 'suspensao' | 'advertencia' | 'apuracao' | 'feedback' | 'outra';

export function classificarMedida(codigo: string, label: string): MedidaKind {
  const blob = `${codigo} ${label}`.toLowerCase();
  if (/apura/.test(blob)) return 'apuracao';
  if (/suspens/.test(blob)) return 'suspensao';
  if (/feedback/.test(blob)) return 'feedback';
  if (/advert/.test(blob)) return 'advertencia';
  return 'outra';
}

/** Extrai linhas "Decisão DP: …" das observações. */
export function extractDecisaoDp(observacoes: string | null | undefined): string {
  if (!observacoes?.trim()) return '';
  return observacoes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^decis[aã]o\s*dp\s*:/i.test(l))
    .map((l) => l.replace(/^decis[aã]o\s*dp\s*:\s*/i, '').trim())
    .filter(Boolean)
    .join(' ');
}

export type NotificacaoEmailInput = {
  env: AdvertenciasEmailEnv;
  to: string;
  tipo: 'aprovada' | 'recusada';
  colaboradorNome: string;
  nivelLabel: string;
  nivelCodigo?: string;
  motivoTexto: string;
  aprovadoPor: string;
  recusaMotivo?: string;
  /** Medida original quando o DP reformulou. */
  nivelSolicitadoLabel?: string;
  diasSuspensao?: number;
  diasSolicitados?: number;
  /** Texto da decisão (ajuste) — ex. extraído de observacoes_supervisor. */
  decisaoDp?: string;
  pdfBase64?: string;
  dashboardUrl?: string;
  controleDpUrl?: string;
};

export type NotificacaoCopy = {
  assunto: string;
  introHtml: string;
  introText: string;
  medidaAtual: string;
  reformulada: boolean;
};

export function buildAdvertenciaNotificacaoCopy(
  input: Omit<NotificacaoEmailInput, 'env' | 'to' | 'pdfBase64' | 'dashboardUrl' | 'controleDpUrl'>,
): NotificacaoCopy {
  const kind = classificarMedida(input.nivelCodigo || '', input.nivelLabel);
  const dias =
    input.diasSuspensao && input.diasSuspensao > 0 && !/\d+\s*dia/i.test(input.nivelLabel)
      ? ` (${input.diasSuspensao} dia(s))`
      : '';
  const medidaAtual = `${input.nivelLabel}${dias}`;
  const solicitada = (input.nivelSolicitadoLabel || '').trim();
  const reformulada = Boolean(
    solicitada && solicitada.toLowerCase() !== input.nivelLabel.trim().toLowerCase(),
  );

  const nomeMedida =
    kind === 'suspensao'
      ? 'Suspensão'
      : kind === 'apuracao'
        ? 'Apuração'
        : kind === 'feedback'
          ? 'Feedback'
          : kind === 'advertencia'
            ? 'Advertência'
            : 'Medida disciplinar';

  let assunto: string;
  if (input.tipo === 'recusada') {
    assunto = `[3F RH] Solicitação devolvida — ${input.colaboradorNome}`;
  } else if (reformulada) {
    assunto = `[3F RH] Medida ajustada e autorizada — ${input.colaboradorNome}`;
  } else if (kind === 'suspensao') {
    assunto = `[3F RH] Suspensão aprovada — ${input.colaboradorNome}`;
  } else {
    assunto = `[3F RH] ${nomeMedida} autorizada — ${input.colaboradorNome}`;
  }

  let introHtml: string;
  let introText: string;
  if (input.tipo === 'recusada') {
    introHtml = `A solicitação de medida disciplinar para <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>devolvida/recusada</strong> pelo DP.`;
    introText = `Solicitação devolvida para ${input.colaboradorNome}.`;
  } else if (reformulada) {
    introHtml = `A medida para <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>ajustada e autorizada</strong> pelo DP.`;
    introText = `Medida ajustada e autorizada para ${input.colaboradorNome}.`;
  } else {
    introHtml = `A ${escHtml(nomeMedida.toLowerCase())} referente a <strong>${escHtml(input.colaboradorNome)}</strong> foi <strong>autorizada</strong> pelo DP.`;
    introText = `${nomeMedida} autorizada para ${input.colaboradorNome}.`;
  }

  return { assunto, introHtml, introText, medidaAtual, reformulada };
}

export async function sendAdvertenciaNotificacao(
  input: NotificacaoEmailInput,
): Promise<{ ok: boolean; skipped?: boolean; error?: string; detail?: string }> {
  if (!advertenciasEmailConfigured(input.env)) {
    return { ok: false, skipped: true, error: 'E-mail não configurado no Pages (ADVERTENCIAS_EMAIL_ENABLED).' };
  }

  const from = parseFrom(input.env.ADVERTENCIAS_EMAIL_FROM!);
  const copy = buildAdvertenciaNotificacaoCopy(input);
  const solicitada = (input.nivelSolicitadoLabel || '').trim();
  const decisao = (input.decisaoDp || '').trim();
  const recusa = (input.recusaMotivo || '').trim();

  const listaExtra: string[] = [];
  if (copy.reformulada && solicitada) {
    listaExtra.push(
      `<li><strong>Solicitado:</strong> ${escHtml(solicitada)}${
        input.diasSolicitados && input.diasSolicitados > 0
          ? ` (${input.diasSolicitados} dia(s))`
          : ''
      }</li>`,
    );
    listaExtra.push(`<li><strong>Decisão do DP:</strong> ${escHtml(copy.medidaAtual)}</li>`);
  } else {
    listaExtra.push(`<li><strong>Medida:</strong> ${escHtml(copy.medidaAtual)}</li>`);
  }
  listaExtra.push(`<li><strong>Motivo:</strong> ${escHtml(input.motivoTexto)}</li>`);
  listaExtra.push(`<li><strong>Responsável DP:</strong> ${escHtml(input.aprovadoPor)}</li>`);
  if (input.tipo === 'recusada' && recusa) {
    listaExtra.push(`<li><strong>Motivo da devolução:</strong> ${escHtml(recusa)}</li>`);
  }
  if (input.tipo === 'aprovada' && decisao) {
    listaExtra.push(`<li><strong>Orientação do DP:</strong> ${escHtml(decisao)}</li>`);
  }

  const ctaHtml =
    input.tipo === 'aprovada'
      ? `<p>O PDF oficial${input.pdfBase64 ? ' está em anexo' : ' pode ser emitido no dashboard'}. Impressão e protocolo de entrega ficam no <strong>Controle DP</strong>${
          input.controleDpUrl
            ? ` (<a href="${escHtml(input.controleDpUrl)}">abrir</a>)`
            : ''
        }.</p>`
      : `<p>Acesse o dashboard para revisar e, se necessário, reenviar com a medida sugerida pelo DP.</p>`;

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
<p>${copy.introHtml}</p>
<ul>
  ${listaExtra.join('\n  ')}
</ul>
${ctaHtml}
${
  input.dashboardUrl
    ? `<p><a href="${escHtml(input.dashboardUrl)}">Abrir Advertências (acompanhamento)</a></p>`
    : ''
}
<p style="color:#666;font-size:12px">Mensagem automática — 3F Contact Center · RH</p>
</body></html>`;

  const textLines = [
    copy.introText,
    `Colaborador: ${input.colaboradorNome}`,
    copy.reformulada && solicitada
      ? `Solicitado: ${solicitada}${input.diasSolicitados ? ` (${input.diasSolicitados}d)` : ''}`
      : '',
    `Medida: ${copy.medidaAtual}`,
    `Motivo: ${input.motivoTexto}`,
    `DP: ${input.aprovadoPor}`,
    recusa ? `Devolução: ${recusa}` : '',
    decisao ? `Orientação DP: ${decisao}` : '',
    input.tipo === 'aprovada' ? 'PDF oficial disponível após autorização (anexo se configurado).' : '',
    input.controleDpUrl ? `Controle DP: ${input.controleDpUrl}` : '',
    input.dashboardUrl ? `Advertências: ${input.dashboardUrl}` : '',
  ];

  const body: Record<string, unknown> = {
    from: { address: from.address, name: from.name || 'RH 3F' },
    to: [{ address: input.to }],
    subject: copy.assunto,
    html,
    text: textLines.filter(Boolean).join('\n'),
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
