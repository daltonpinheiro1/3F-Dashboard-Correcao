/** Sanitiza briefing RR no Worker — a UI também normaliza em src/lib/rrBriefing.ts. */

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function stripFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json|markdown|md)?\s*([\s\S]*?)```$/i);
  return (m ? m[1] : t).trim();
}

function looksJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function joinList(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'string' ? x : isObj(x) ? String(x.titulo || x.acao || x.texto || x.label || '') : ''))
      .filter(Boolean)
      .map((x) => `- ${x}`)
      .join('\n');
  }
  return typeof v === 'string' ? v : '';
}

export function sanitizarBriefingRr(raw: string): string {
  const t = stripFence(String(raw || ''));
  if (!t) return '';
  if (!looksJson(t)) return t;
  try {
    const parsed: unknown = JSON.parse(t);
    if (typeof parsed === 'string') return sanitizarBriefingRr(parsed);
    if (!isObj(parsed)) return '';
    for (const k of ['texto', 'markdown', 'briefing', 'content', 'resposta']) {
      if (typeof parsed[k] === 'string' && parsed[k].trim() && !looksJson(String(parsed[k]).trim())) {
        return String(parsed[k]).trim();
      }
    }
    const parts: string[] = [];
    if (typeof parsed.situacao === 'string') parts.push(`## Situação\n${parsed.situacao}`);
    const gap = joinList(parsed.causas || parsed.fontesGap || parsed.gap);
    if (gap) parts.push(`## De onde veio o gap\n${gap}`);
    const ops = joinList(parsed.oportunidades);
    if (ops) parts.push(`## Oportunidades menores\n${ops}`);
    const acoes = joinList(parsed.acoes || parsed.actions);
    if (acoes) parts.push(`## 3 ações\n${acoes}`);
    if (typeof parsed.risco === 'string') parts.push(`## Risco\n${parsed.risco}`);
    return parts.join('\n\n');
  } catch {
    return t;
  }
}

function linhaLista(v: unknown, map?: (x: Record<string, unknown>) => string): string {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v
    .map((x) => {
      if (typeof x === 'string') return x;
      if (isObj(x) && map) return map(x);
      if (isObj(x)) return String(x.supervisor || x.titulo || x.label || '');
      return '';
    })
    .filter(Boolean)
    .join('; ');
}

/** Converte o body JSON em prosa — o modelo não recebe JSON para ecoar. */
export function insightUserText(payload: unknown): string {
  if (!isObj(payload)) return '';
  const janela = isObj(payload.janela) ? payload.janela : {};
  const lines = [
    `Recorte: horizonte ${payload.horizonte || 'realtime'} · ${payload.dataRef || ''} · campanha ${payload.campanha || ''}.`,
    `Janela ${janela.from || ''} a ${janela.to || ''} · ${janela.diasComDados ?? ''} dia(s) com dados.`,
    `EVA ${payload.vendasEva} vs meta ${payload.metaDia} · ${payload.pctMeta}% · gap ${payload.gap} (${payload.gapPct}%).`,
    `CPC ${payload.cpc}%. Logados ${payload.logados ?? 'n/a'}. Ofensores críticos ${payload.ofensoresCriticos ?? 0}.`,
  ];
  if (payload.gross != null) lines.push(`Gross ${payload.gross}. Taxa erro ${payload.taxaErro ?? 'n/a'}%. TIM ${payload.tim ?? 'n/a'}.`);
  const mix = linhaLista(payload.mix, (x) => `${x.label} ${x.vendas}/${x.meta} gap ${x.gap}`);
  if (mix) lines.push(`Mix comercial: ${mix}.`);
  const fontes = linhaLista(payload.fontesGap, (x) => `${x.label} ${x.valor} (${x.pct}%)`);
  if (fontes) lines.push(`De onde veio o gap: ${fontes}.`);
  const ops = linhaLista(payload.oportunidades, (x) => `${x.titulo} impacto ${x.impacto}`);
  if (ops) lines.push(`Oportunidades medidas: ${ops}.`);
  const tops = linhaLista(payload.topSup, (x) => `${x.supervisor} ${x.vendas} (${x.pctMeta}% gap ${x.gap})`);
  if (tops) lines.push(`Top supervisores: ${tops}.`);
  const acoes = linhaLista(payload.acoesAbertas);
  if (acoes) lines.push(`Ações ainda abertas da RR anterior: ${acoes}.`);
  if (typeof payload.forecastRealista === 'number') {
    lines.push(`Forecast realista ${payload.forecastRealista}. P(atingir) ${payload.probMeta ?? 'n/a'}%.`);
  }
  const ex = linhaLista(payload.exceptions);
  if (ex) lines.push(`Exceções: ${ex}.`);
  lines.push('Todas = Port+Mig. Não invente número. Não recálcule CPC/DROP/TMA. Sem elasticidade.');
  return lines.join('\n');
}
