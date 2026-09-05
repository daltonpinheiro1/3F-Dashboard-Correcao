/**
 * Motivo operacional da fila / Toutbox — não confundir com dashboard_manual.
 */

const INTERNO = /^(dashboard_manual:|enfileirado via)/i;
const OPERACIONAL =
  /bko\s*:|sem iccid|toutbox|gaps\s*:|aguardando|max tentativas|cpf inv[aá]lido|http\s+\d|erro no aprov|numero_linha|tempor[aá]rio/i;

export function stripDedupSuffix(s: string): string {
  return s.replace(/\s*\|\s*dashboard_dedup:.*$/i, '').trim();
}

export function isMotivoInterno(s: string): boolean {
  return INTERNO.test(s.trim());
}

export function isMotivoOperacional(s: string): boolean {
  const t = s.trim();
  return Boolean(t) && OPERACIONAL.test(t) && !INTERNO.test(t);
}

export function escolherMotivoOperacional(opts: {
  filas?: Array<{ retorno_motivo?: string | null; resultado_mensagem?: string | null }>;
  motivoInfo?: { motivo?: string; msg?: string } | null;
}): string | null {
  const texts: string[] = [];
  for (const f of opts.filas || []) {
    const msg = String(f.resultado_mensagem || '').trim();
    const mot = String(f.retorno_motivo || '').trim();
    if (msg) texts.push(msg);
    if (mot) texts.push(mot);
  }
  const info = opts.motivoInfo;
  if (info?.msg) texts.push(String(info.msg).trim());
  if (info?.motivo) texts.push(String(info.motivo).trim());

  const clean = texts.map((t) => stripDedupSuffix(t)).filter(Boolean);
  const ops = clean.find(isMotivoOperacional);
  if (ops) return ops;
  const outro = clean.find((t) => !isMotivoInterno(t));
  return outro || null;
}

/** Rótulo ICCID no estilo Toutbox/worker (não só sim/não). */
export function rotuloIccidToutbox(temIccid: boolean, motivo: string | null | undefined): string {
  if (temIccid) return 'sim';
  const m = stripDedupSuffix(String(motivo || ''));
  if (/sem iccid/i.test(m)) {
    return `não · ${m.replace(/^bko:\s*/i, '')}`;
  }
  return 'não';
}

export function resumoFilaUnica(
  filas: Array<{ acao?: string | null; status?: string | null }>,
  max = 3,
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const f of filas) {
    const p = `${f.acao || '?'}:${f.status || '?'}`;
    if (seen.has(p)) continue;
    seen.add(p);
    parts.push(p);
    if (parts.length >= max) break;
  }
  return parts.join(', ') || null;
}
