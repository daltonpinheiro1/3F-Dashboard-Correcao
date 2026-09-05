/** Agregação da decision matrix a partir de retornos + fila. */

export type MatrixCountRow = { label: string; count: number };

export type MatrixPayload = {
  ok: boolean;
  timestamp: string;
  dias: number;
  matrix_version: string;
  matrix_version_tag: string;
  total_retornos: number;
  fonte: 'retornos' | 'fila' | 'mista';
  decisoes: MatrixCountRow[];
  motivos: MatrixCountRow[];
  canceladas: {
    total_executados: number;
    motivo_recusa: MatrixCountRow[];
    categorias: Record<string, number>;
  };
  nota: string;
};

const MX_RE = /\[mx:([a-f0-9]{6,16})\]/i;

const CATEGORIAS_VAZIAS: Record<string, number> = {
  conflito_data: 0,
  sem_resposta_sms: 0,
  portabilidade_ja_cancelada: 0,
  cpf_invalido: 0,
  restricao: 0,
  rejeicao_cliente: 0,
  erro_sistema: 0,
  numero_vago: 0,
  bug_fix_reenfileiramento: 0,
  always_ignore: 0,
  matrix_unknown: 0,
  outros: 0,
};

export function parseMatrixVersion(text: string | null | undefined): string {
  const m = MX_RE.exec(String(text || ''));
  return m?.[1] ? m[1].toLowerCase() : '';
}

export function stripMatrixTag(text: string | null | undefined): string {
  return String(text || '')
    .replace(MX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function motivoCurto(raw: string, max = 72): string {
  const s = stripMatrixTag(raw) || '(sem motivo)';
  const first = s.split('|')[0]?.trim() || s;
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

export function categorizarMotivoCancelamento(motivo: string): string {
  const ml = motivo.toLowerCase();
  if (ml.includes('conflito') && (ml.includes('data') || ml.includes('passada'))) return 'conflito_data';
  if (ml.includes('sem resposta') || (ml.includes('sms') && !ml.includes('rejeic'))) return 'sem_resposta_sms';
  if (ml.includes('já cancelada') || ml.includes('ja cancelada')) return 'portabilidade_ja_cancelada';
  if (ml.includes('cpf')) return 'cpf_invalido';
  if (ml.includes('número vago') || ml.includes('numero vago')) return 'numero_vago';
  if (ml.includes('restri')) return 'restricao';
  if (ml.includes('bug fix') || ml.includes('re-enfileiramento')) return 'bug_fix_reenfileiramento';
  if (ml.includes('rejeição') || ml.includes('rejeicao')) return 'rejeicao_cliente';
  if (ml.includes('erro') || ml.includes('sistema') || ml.includes('exceção') || ml.includes('excecao')) {
    return 'erro_sistema';
  }
  if (ml.includes('always_ignore') || ml.includes('ignorar') || ml.includes('no_action')) return 'always_ignore';
  if (ml.includes('unknown') || ml.includes('pending_analysis')) return 'matrix_unknown';
  return 'outros';
}

export function contarPorLabel(
  values: Array<string | null | undefined>,
  top = 15,
): MatrixCountRow[] {
  const c = new Map<string, number>();
  for (const v of values) {
    const k = String(v || '').trim() || '(vazio)';
    c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, top)
    .map(([label, count]) => ({ label, count }));
}

export function versaoMaisFrequente(tags: string[]): string {
  const ranked = contarPorLabel(tags.filter(Boolean), 1);
  return ranked[0]?.label || '';
}

function textoLinha(row: Record<string, unknown>, keys: string[]): string {
  return keys.map((k) => String(row[k] ?? '')).filter(Boolean).join(' ');
}

export function hintFromRows(
  rows: Array<Record<string, unknown>>,
): { matrix_version: string; matrix_version_tag: string } {
  for (const row of rows) {
    const mx =
      parseMatrixVersion(String(row.matrix_version || '')) ||
      parseMatrixVersion(textoLinha(row, ['adjustments', 'resultado_mensagem', 'retorno_motivo', 'decisao_reason']));
    if (mx) return { matrix_version: mx, matrix_version_tag: `[mx:${mx}]` };
  }
  return { matrix_version: '', matrix_version_tag: '' };
}

const ACOES_IGNORAR = new Set(['', 'no_action', 'always_ignore', 'ignore', 'unknown']);

export function isDecisaoContavel(acao: string): boolean {
  const a = String(acao || '').trim().toLowerCase();
  if (!a || ACOES_IGNORAR.has(a)) return false;
  if (/unknown|pending_analysis|evaluate_return/.test(a)) return false;
  return true;
}

export function montarMatrixPayload(opts: {
  dias: number;
  retornos: Array<Record<string, unknown>>;
  cancelamentos: Array<Record<string, unknown>>;
  fila?: Array<Record<string, unknown>>;
  agora?: Date;
}): MatrixPayload {
  const agora = opts.agora || new Date();
  const versions: string[] = [];
  const decisoes: string[] = [];
  const motivos: string[] = [];

  for (const row of opts.retornos) {
    const mx =
      parseMatrixVersion(String(row.matrix_version || '')) ||
      parseMatrixVersion(textoLinha(row, ['adjustments', 'decisao_reason', 'motivo']));
    if (mx) versions.push(mx);
    const acao = String(row.acao_decidida || row.operacao || '').trim();
    if (isDecisaoContavel(acao)) decisoes.push(acao);
    const mot = motivoCurto(String(row.motivo || row.adjustments || row.retorno_motivo || ''));
    if (mot && mot !== '(sem motivo)') motivos.push(mot);
  }

  const fila = opts.fila || [];
  if (!decisoes.length) {
    for (const row of fila) {
      const acao = String(row.acao || '').trim();
      if (isDecisaoContavel(acao)) decisoes.push(acao);
    }
  }
  if (!motivos.length) {
    for (const row of fila) {
      const mot = motivoCurto(String(row.retorno_motivo || row.resultado_mensagem || ''));
      if (mot && mot !== '(sem motivo)') motivos.push(mot);
    }
  }
  for (const row of [...opts.cancelamentos, ...fila]) {
    const mx = parseMatrixVersion(textoLinha(row, ['resultado_mensagem', 'retorno_motivo', 'adjustments']));
    if (mx) versions.push(mx);
  }

  const cMotivo = new Map<string, number>();
  const categorias: Record<string, number> = { ...CATEGORIAS_VAZIAS };
  for (const row of opts.cancelamentos) {
    const mot = motivoCurto(String(row.retorno_motivo || row.resultado_mensagem || ''));
    cMotivo.set(mot, (cMotivo.get(mot) || 0) + 1);
    const cat = categorizarMotivoCancelamento(mot);
    categorias[cat] = (categorias[cat] || 0) + 1;
  }

  const mx = versaoMaisFrequente(versions);
  const fonte: MatrixPayload['fonte'] = opts.retornos.length
    ? fila.length
      ? 'mista'
      : 'retornos'
    : 'fila';

  return {
    ok: true,
    timestamp: agora.toISOString(),
    dias: opts.dias,
    matrix_version: mx,
    matrix_version_tag: mx ? `[mx:${mx}]` : '',
    total_retornos: opts.retornos.length,
    fonte,
    decisoes: contarPorLabel(decisoes, 12),
    motivos: contarPorLabel(motivos, 12),
    canceladas: {
      total_executados: opts.cancelamentos.length,
      motivo_recusa: [...cMotivo.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, count]) => ({ label, count })),
      categorias,
    },
    nota:
      'Decisões = operacao dos retornos (fallback: acao da fila). Canceladas = fila acao=cancel concluída. Versão lida de [mx:] nos adjustments.',
  };
}
