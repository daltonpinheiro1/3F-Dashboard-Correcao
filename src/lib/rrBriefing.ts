/**
 * Briefing RR: a IA às vezes devolve JSON (o prompt antigo pedia “use o JSON”).
 * A tela nunca deve mostrar payload — só prosa de comitê.
 */

const TEXTO_KEYS = ['texto', 'markdown', 'briefing', 'content', 'resposta', 'narrativa'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function stripFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json|markdown|md)?\s*([\s\S]*?)```$/i);
  return (m ? m[1] : t).trim();
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function joinList(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'string' ? x : isPlainObject(x) ? String(x.titulo || x.acao || x.texto || '') : String(x)))
      .filter(Boolean)
      .map((x) => `- ${x}`)
      .join('\n');
  }
  return typeof v === 'string' ? v : '';
}

function markdownFromObject(obj: Record<string, unknown>): string {
  for (const k of TEXTO_KEYS) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() && !looksLikeJson(v.trim())) return v.trim();
  }

  const parts: string[] = [];
  const situacao = obj.situacao || obj.Situação || obj.summary;
  if (typeof situacao === 'string' && situacao.trim()) {
    parts.push(`## Situação\n${situacao.trim()}`);
  }
  const gap = obj.gap || obj.causas || obj.fontesGap || obj.de_onde_veio;
  const gapTxt = joinList(gap) || (typeof gap === 'string' ? gap : '');
  if (gapTxt) parts.push(`## De onde veio o gap\n${gapTxt}`);
  const ops = obj.oportunidades || obj.alavancas;
  const opsTxt = joinList(ops);
  if (opsTxt) parts.push(`## Oportunidades menores\n${opsTxt}`);
  const acoes = obj.acoes || obj.ações || obj.actions;
  const acoesTxt = joinList(acoes);
  if (acoesTxt) parts.push(`## 3 ações\n${acoesTxt}`);
  const risco = obj.risco || obj.risk;
  if (typeof risco === 'string' && risco.trim()) parts.push(`## Risco\n${risco.trim()}`);
  if (parts.length) return parts.join('\n\n');
  return '';
}

export function pareceJsonBriefing(s: string): boolean {
  const t = stripFence(s);
  if (!looksLikeJson(t)) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Converte resposta da IA em markdown de comitê. Nunca devolve JSON cru. */
export function normalizarBriefingRr(raw: string): string {
  const t = stripFence(String(raw || ''));
  if (!t) return '';
  if (!looksLikeJson(t)) return t;
  try {
    const parsed: unknown = JSON.parse(t);
    if (typeof parsed === 'string') return normalizarBriefingRr(parsed);
    if (isPlainObject(parsed)) {
      const md = markdownFromObject(parsed);
      if (md) return md;
    }
    if (Array.isArray(parsed)) {
      const lines = parsed
        .map((x) => (typeof x === 'string' ? x : isPlainObject(x) ? String(x.titulo || x.texto || '') : ''))
        .filter(Boolean);
      if (lines.length) return lines.map((x) => `- ${x}`).join('\n');
    }
  } catch {
    return t;
  }
  return '';
}
