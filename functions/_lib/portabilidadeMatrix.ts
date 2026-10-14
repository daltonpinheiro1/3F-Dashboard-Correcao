/** Agregação da decision matrix a partir de retornos + fila. */

/** `count` = propostas distintas quando a fonte é o resumo SQL; `linhas` = registros. */
export type MatrixCountRow = { label: string; count: number; linhas?: number };

export type MatrixFilaStatus = {
  acao: string;
  executada: number;
  pendente: number;
  descartada: number;
  outros: number;
  linhas: number;
};

export type MatrixVersao = {
  versao: string;
  linhas: number;
  propostas: number;
  desde: string;
  ate: string;
  vigente: boolean;
  decisoes: MatrixCountRow[];
};

export type MatrixLoop = { proposta: string; retornos: number; operacao: string; motivo: string; ultimo: string };

export type MatrixPayload = {
  ok: boolean;
  timestamp: string;
  dias: number;
  matrix_version: string;
  matrix_version_tag: string;
  total_retornos: number;
  fonte: 'retornos' | 'fila' | 'mista' | 'resumo_sql';
  /** true = contagens exatas do banco; false = leitura paginada com teto. */
  exato: boolean;
  retornos?: { linhas: number; propostas: number };
  sem_acao?: { linhas: number; propostas: number; motivos: MatrixCountRow[] };
  fila_status?: MatrixFilaStatus[];
  fila_total?: { linhas: number; propostas: number };
  versoes?: MatrixVersao[];
  /** `sem_acao` = loops cuja decisão dominante é no_action (inesperado); o resto é ciclo de reconsulta. */
  loops?: { limite: number; total: number; retornos: number; sem_acao: number; top: MatrixLoop[] };
  cobertura: {
    retornos: { lidos: number; truncado: boolean };
    fila: { lidos: number; truncado: boolean };
    cancelamentos: { lidos: number; truncado: boolean };
  };
  decisoes: MatrixCountRow[];
  fila_acoes: MatrixCountRow[];
  motivos: MatrixCountRow[];
  motivos_fila: MatrixCountRow[];
  canceladas: {
    total_executados: number;
    propostas?: number;
    motivo_recusa: MatrixCountRow[];
    categorias: Record<string, number>;
    /** Categorias com rótulo legível, maior → menor, sem zeros. */
    categorias_rows: MatrixCountRow[];
  };
  nota: string;
};

const MX_RE = /\[mx:([a-f0-9]{6,16})\]/i;

const CATEGORIAS_VAZIAS: Record<string, number> = {
  sem_resposta_sms: 0,
  rejeicao_cliente: 0,
  cancelado_cliente: 0,
  janela_reagendamento: 0,
  status_divergente: 0,
  conflito_data: 0,
  bdr_automatico: 0,
  sem_bilhete: 0,
  escalonamento: 0,
  portabilidade_ja_cancelada: 0,
  cpf_invalido: 0,
  restricao: 0,
  erro_sistema: 0,
  numero_vago: 0,
  bug_fix_reenfileiramento: 0,
  always_ignore: 0,
  matrix_unknown: 0,
  outros: 0,
};

export const CATEGORIA_CANCELAMENTO_LABEL: Record<string, string> = {
  sem_resposta_sms: 'Sem resposta ao SMS',
  rejeicao_cliente: 'Rejeição do cliente',
  cancelado_cliente: 'Cancelado pelo cliente',
  janela_reagendamento: 'Fora da janela de reagendamento',
  status_divergente: 'Status diferente do esperado',
  conflito_data: 'Conflito de data',
  bdr_automatico: 'Cancelamento automático (BDR)',
  sem_bilhete: 'Sem bilhete de portabilidade',
  escalonamento: 'Escalonamento (reagendamento falhou)',
  portabilidade_ja_cancelada: 'Portabilidade já cancelada',
  cpf_invalido: 'CPF inválido',
  restricao: 'Restrição',
  erro_sistema: 'Erro de sistema',
  numero_vago: 'Número vago',
  bug_fix_reenfileiramento: 'Reenfileiramento (correção)',
  always_ignore: 'Ignorado pela matriz',
  matrix_unknown: 'Não mapeado na matriz',
  outros: 'Outros',
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

export function categoriasRotuladas(categorias: Record<string, number>): MatrixCountRow[] {
  return Object.entries(categorias)
    .filter(([, count]) => count > 0)
    .map(([k, count]) => ({ label: CATEGORIA_CANCELAMENTO_LABEL[k] || k, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Ordem importa: rejeição antes de SMS; "diferente de Conflito" antes de conflito. */
export function categorizarMotivoCancelamento(motivo: string): string {
  const ml = semAcento(motivo);
  if (ml.includes('rejeicao')) return 'rejeicao_cliente';
  if (ml.includes('sem resposta') || ml.includes('sms')) return 'sem_resposta_sms';
  if (ml.includes('pelo cliente')) return 'cancelado_cliente';
  if (ml.includes('janela')) return 'janela_reagendamento';
  if (ml.includes('diferente de')) return 'status_divergente';
  if (ml.includes('conflito') && (ml.includes('data') || ml.includes('passada'))) return 'conflito_data';
  if (/\bbdr\b/.test(ml)) return 'bdr_automatico';
  if (ml.includes('nenhum bilhete') || ml.includes('sem bilhete')) return 'sem_bilhete';
  if (ml.includes('escalonamento')) return 'escalonamento';
  if (ml.includes('ja cancelada')) return 'portabilidade_ja_cancelada';
  if (ml.includes('cpf')) return 'cpf_invalido';
  if (ml.includes('numero vago')) return 'numero_vago';
  if (ml.includes('restri')) return 'restricao';
  if (ml.includes('bug fix') || ml.includes('re-enfileiramento')) return 'bug_fix_reenfileiramento';
  if (ml.includes('always_ignore') || ml.includes('ignorar') || ml.includes('no_action')) return 'always_ignore';
  if (ml.includes('unknown') || ml.includes('pending_analysis')) return 'matrix_unknown';
  if (ml.includes('erro') || ml.includes('sistema') || ml.includes('excecao')) return 'erro_sistema';
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
  truncados?: { retornos?: boolean; fila?: boolean; cancelamentos?: boolean };
  agora?: Date;
}): MatrixPayload {
  const agora = opts.agora || new Date();
  const versions: string[] = [];
  const decisoes: string[] = [];
  const motivos: string[] = [];
  const filaAcoes: string[] = [];
  const motivosFila: string[] = [];

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
  for (const row of fila) {
    const acao = String(row.acao || '').trim();
    if (isDecisaoContavel(acao)) filaAcoes.push(acao);
    const mot = motivoCurto(String(row.retorno_motivo || row.resultado_mensagem || ''));
    if (mot && mot !== '(sem motivo)') motivosFila.push(mot);
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
    exato: false,
    cobertura: {
      retornos: { lidos: opts.retornos.length, truncado: Boolean(opts.truncados?.retornos) },
      fila: { lidos: fila.length, truncado: Boolean(opts.truncados?.fila) },
      cancelamentos: {
        lidos: opts.cancelamentos.length,
        truncado: Boolean(opts.truncados?.cancelamentos),
      },
    },
    decisoes: contarPorLabel(decisoes, 12),
    fila_acoes: contarPorLabel(filaAcoes, 12),
    motivos: contarPorLabel(motivos, 12),
    motivos_fila: contarPorLabel(motivosFila, 12),
    canceladas: {
      total_executados: opts.cancelamentos.length,
      motivo_recusa: [...cMotivo.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, count]) => ({ label, count })),
      categorias,
      categorias_rows: categoriasRotuladas(categorias),
    },
    nota:
      'Decisões executadas vêm dos retornos; ações em fila são exibidas separadamente. Canceladas = fila acao=cancel concluída. Versão lida de [mx:] nos adjustments.',
  };
}

/** Resposta de `portabilidade_matrix_resumo` (migration 049, projeto Qigger). */
export type MatrixResumoSql = {
  versao_rpc?: number;
  loop_min?: number;
  retornos?: { linhas: number; propostas: number };
  decisoes?: Array<{ label: string; linhas: number; propostas: number }>;
  motivos?: Array<{ label: string; linhas: number; propostas: number }>;
  sem_acao_motivos?: Array<{ label: string; linhas: number; propostas: number }>;
  fila?: Array<{ acao: string; status: string; linhas: number; propostas: number }>;
  fila_total?: { linhas: number; propostas: number };
  fila_motivos?: Array<{ label: string; linhas: number; propostas: number }>;
  cancelamentos?: {
    linhas: number;
    propostas: number;
    motivos?: Array<{ label: string; linhas: number; propostas: number }>;
  };
  versoes?: Array<{
    versao: string;
    linhas: number;
    propostas: number;
    desde: string;
    ate: string;
    decisoes?: Array<{ label: string; propostas: number }>;
  }>;
  loops?: { total: number; retornos: number; por_operacao?: Record<string, number>; top?: MatrixLoop[] };
};

const STATUS_FILA: Record<string, keyof Pick<MatrixFilaStatus, 'executada' | 'pendente' | 'descartada'>> = {
  concluida: 'executada',
  pendente: 'pendente',
  executando: 'pendente',
  cancelado: 'descartada',
  cancelada: 'descartada',
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function linhasContagem(rows: Array<{ label: string; linhas: number; propostas: number }> | undefined): MatrixCountRow[] {
  return (rows || []).map((r) => ({ label: r.label, count: num(r.propostas), linhas: num(r.linhas) }));
}

/** Fila pivotada por ação; status fora do mapa (bko, escalonado...) vão para `outros`. Contagem em propostas. */
export function pivotarFilaStatus(
  rows: Array<{ acao: string; status: string; linhas: number; propostas: number }>,
): MatrixFilaStatus[] {
  const porAcao = new Map<string, MatrixFilaStatus>();
  for (const r of rows) {
    const atual = porAcao.get(r.acao) || { acao: r.acao, executada: 0, pendente: 0, descartada: 0, outros: 0, linhas: 0 };
    const chave = STATUS_FILA[String(r.status || '').toLowerCase()] || 'outros';
    atual[chave] += num(r.propostas);
    atual.linhas += num(r.linhas);
    porAcao.set(r.acao, atual);
  }
  return [...porAcao.values()].sort((a, b) => b.linhas - a.linhas || a.acao.localeCompare(b.acao));
}

export function montarMatrixDeResumo(opts: {
  dias: number;
  resumo: MatrixResumoSql;
  agora?: Date;
}): MatrixPayload {
  const r = opts.resumo;
  const agora = opts.agora || new Date();
  const decisoesTodas = linhasContagem(r.decisoes);
  const semAcao = decisoesTodas.find((d) => d.label === 'no_action');
  const versoes: MatrixVersao[] = (r.versoes || [])
    .map((v) => ({
      versao: String(v.versao || '').toLowerCase(),
      linhas: num(v.linhas),
      propostas: num(v.propostas),
      desde: String(v.desde || ''),
      ate: String(v.ate || ''),
      vigente: false,
      decisoes: (v.decisoes || []).map((d) => ({ label: d.label, count: num(d.propostas) })),
    }))
    .sort((a, b) => b.ate.localeCompare(a.ate));
  if (versoes[0]) versoes[0].vigente = true;
  const vigente = versoes[0]?.versao || '';

  const motivosCanc = linhasContagem(r.cancelamentos?.motivos);
  const categorias: Record<string, number> = { ...CATEGORIAS_VAZIAS };
  for (const m of motivosCanc) {
    const cat = categorizarMotivoCancelamento(m.label);
    categorias[cat] = (categorias[cat] || 0) + (m.linhas ?? m.count);
  }
  const filaStatus = pivotarFilaStatus(r.fila || []);
  const retornos = { linhas: num(r.retornos?.linhas), propostas: num(r.retornos?.propostas) };
  const filaTotal = { linhas: num(r.fila_total?.linhas), propostas: num(r.fila_total?.propostas) };
  const cancLinhas = num(r.cancelamentos?.linhas);

  return {
    ok: true,
    timestamp: agora.toISOString(),
    dias: opts.dias,
    matrix_version: vigente,
    matrix_version_tag: vigente ? `[mx:${vigente}]` : '',
    total_retornos: retornos.linhas,
    fonte: 'resumo_sql',
    exato: true,
    retornos,
    sem_acao: {
      linhas: semAcao?.linhas ?? 0,
      propostas: semAcao?.count ?? 0,
      motivos: linhasContagem(r.sem_acao_motivos),
    },
    fila_status: filaStatus,
    fila_total: filaTotal,
    versoes,
    loops: {
      limite: num(r.loop_min) || 20,
      total: num(r.loops?.total),
      retornos: num(r.loops?.retornos),
      sem_acao: num(r.loops?.por_operacao?.no_action),
      top: (r.loops?.top || []).map((l) => ({
        proposta: String(l.proposta || ''),
        retornos: num(l.retornos),
        operacao: String(l.operacao || ''),
        motivo: String(l.motivo || ''),
        ultimo: String(l.ultimo || ''),
      })),
    },
    cobertura: {
      retornos: { lidos: retornos.linhas, truncado: false },
      fila: { lidos: filaTotal.linhas, truncado: false },
      cancelamentos: { lidos: cancLinhas, truncado: false },
    },
    decisoes: decisoesTodas.filter((d) => isDecisaoContavel(d.label)),
    fila_acoes: filaStatus.map((f) => ({ label: f.acao, count: f.executada + f.pendente + f.descartada + f.outros, linhas: f.linhas })),
    motivos: linhasContagem(r.motivos),
    motivos_fila: linhasContagem(r.fila_motivos),
    canceladas: {
      total_executados: cancLinhas,
      propostas: num(r.cancelamentos?.propostas),
      motivo_recusa: motivosCanc.slice(0, 12),
      categorias,
      categorias_rows: categoriasRotuladas(categorias),
    },
    nota:
      'Contagens exatas no banco, por proposta (sufixo da operação removido). Sem ação = no_action. Fila por status: executada (concluída), pendente, descartada (cancelada antes de executar). Cancelamentos = cancel concluído na janela por executed_at.',
  };
}
