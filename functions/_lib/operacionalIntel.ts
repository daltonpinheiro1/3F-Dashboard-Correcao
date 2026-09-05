/** Lógica pura — inteligência operacional (risk, what-if, triage, RAG). */

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RiskSignal = {
  id: string;
  module: string;
  severity: RiskSeverity;
  weight: number;
  label: string;
  detail: string;
  action?: { label: string; href: string };
};

export type RiskRadarInput = {
  taxa_erro_pct?: number;
  taxa_erro_tendencia?: number;
  atestados_pendentes?: number;
  inss_alertas?: number;
  advertencias_pendentes?: number;
  advertencias_criticos?: number;
  cpc_pct?: number;
  meta_cpc?: number;
  eva_stale_min?: number;
  eva_drop_pct?: number;
  portabilidade_p0?: number;
  portabilidade_fila?: number;
  portabilidade_bko?: number;
  portabilidade_falha?: number;
  portabilidade_mais_24h?: number;
  sms_sucesso_pct?: number;
  erro_concentracao_pct?: number;
};

export type RiskContribuicao = {
  id: string;
  label: string;
  weight: number;
  pct: number;
};

export type RiskRadarResult = {
  score: number;
  level: RiskSeverity;
  signals: RiskSignal[];
  resumo: string;
  contribuicoes: RiskContribuicao[];
  interacoes: string[];
  foco: string;
};

export type WhatIfInput = {
  operadores_removidos: number;
  cpc_por_operador_hora: number;
  horas_restantes: number;
  vendas_atuais: number;
  meta_dia: number;
  fila_portabilidade: number;
  minutos_medio_resolucao: number;
  n_operadores?: number;
  elasticidade?: number;
};

export type WhatIfResult = {
  vendas_projetadas: number;
  gap_meta: number;
  impacto_cpc_pct: number;
  horas_fila_extra: number;
  recomendacao: string;
  cenarios: {
    otimista: number;
    realista: number;
    pessimista: number;
  };
  p10: number;
  p50: number;
  p90: number;
  p_atingir_meta: number;
  capacidade_hora: number;
  backlog_vs_janela: number;
};

export type TriageInput = {
  proposta_id: string;
  status?: string;
  idade_horas?: number;
  ultimo_erro?: string;
  tem_os?: boolean;
  tem_ticket?: boolean;
  tentativas?: number;
};

export type TriageResult = {
  classificacao: 'operacional' | 'cliente' | 'sistema' | 'bko' | 'indefinido';
  confianca: number;
  acao_sugerida: string;
  auto_executavel: boolean;
  motivos: string[];
};

export type KnowledgeChunk = {
  id: string;
  categoria: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  score?: number;
};

const TIPOS_NAO_ERRO = new Set(['referencia_tratamento', 'logradouro_acentuacao']);

export function isErroOperacionalServer(tipo: string): boolean {
  return !TIPOS_NAO_ERRO.has(tipo);
}

export function temErroOperacionalServer(tipos: string[] | null | undefined): boolean {
  const arr = Array.isArray(tipos) ? tipos : tipos ? [String(tipos)] : [];
  return arr.some(isErroOperacionalServer);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** CDF da normal padrão (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const d = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  const p =
    1 -
    d *
      (0.31938153 * t -
        0.356563782 * t ** 2 +
        1.781477937 * t ** 3 -
        1.821255978 * t ** 4 +
        1.330274429 * t ** 5);
  return z >= 0 ? p : 1 - p;
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Desvio-padrão amostral. */
export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((a, v) => a + (v - m) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

export function zScores(values: number[]): number[] {
  const sd = sampleStd(values);
  if (sd <= 0) return values.map(() => 0);
  const m = mean(values);
  return values.map((v) => (v - m) / sd);
}

/** Índice de concentração (HHI 0–1) das fatias. */
export function herfindahl(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return counts.reduce((a, c) => a + (c / total) ** 2, 0);
}

/** Corte operacional: tipos até acumular 60% dos erros (inclui o que cruza o limiar). */
export const PARETO_CORTE_PCT = 60;

export function paretoRows(
  items: Array<{ label: string; count: number }>,
  cortePct = PARETO_CORTE_PCT,
): Array<{ label: string; count: number; pct: number; acum_pct: number }> {
  const total = items.reduce((a, i) => a + i.count, 0);
  if (total <= 0) return [];
  let acum = 0;
  const ranked = [...items]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .map((i) => {
      const pct = Math.round((1000 * i.count) / total) / 10;
      acum += pct;
      return { label: i.label, count: i.count, pct, acum_pct: Math.round(acum * 10) / 10 };
    });
  if (cortePct <= 0) return ranked;
  const cut: typeof ranked = [];
  for (const row of ranked) {
    cut.push(row);
    if (row.acum_pct >= cortePct) break;
  }
  return cut;
}

function pushSignal(
  signals: RiskSignal[],
  partial: Omit<RiskSignal, 'weight'> & { weight: number },
) {
  signals.push(partial);
}

export function computeRiskRadar(input: RiskRadarInput): RiskRadarResult {
  const signals: RiskSignal[] = [];
  const interacoes: string[] = [];
  let score = 0;

  const metaCpc = input.meta_cpc ?? 65;
  if (input.cpc_pct != null && input.cpc_pct < metaCpc - 5) {
    const w = clamp((metaCpc - input.cpc_pct) * 2, 10, 35);
    score += w;
    pushSignal(signals, {
      id: 'cpc-baixo',
      module: 'hora',
      severity: input.cpc_pct < metaCpc - 12 ? 'critical' : 'high',
      weight: w,
      label: 'CPC abaixo da meta',
      detail: `CPC ${input.cpc_pct}% vs meta ${metaCpc}%`,
      action: { label: 'Abrir Hora a hora', href: '/hora' },
    });
  }

  if (input.taxa_erro_pct != null && input.taxa_erro_pct > 15) {
    const w = clamp((input.taxa_erro_pct - 15) * 1.5, 8, 25);
    score += w;
    pushSignal(signals, {
      id: 'erro-alto',
      module: 'correcao',
      severity: input.taxa_erro_pct > 25 ? 'high' : 'medium',
      weight: w,
      label: 'Taxa de erro cadastral elevada',
      detail: `${input.taxa_erro_pct}% com erro operacional`,
      action: { label: 'Ver erros', href: '/erros' },
    });
  }

  if (input.taxa_erro_tendencia != null && input.taxa_erro_tendencia > 3) {
    const w = clamp(input.taxa_erro_tendencia * 3, 5, 20);
    score += w;
    pushSignal(signals, {
      id: 'erro-subindo',
      module: 'correcao',
      severity: 'medium',
      weight: w,
      label: 'Erro cadastral em alta',
      detail: `+${input.taxa_erro_tendencia} p.p. vs período anterior`,
    });
  }

  if (
    (input.taxa_erro_pct ?? 0) > 15 &&
    (input.taxa_erro_tendencia ?? 0) > 3
  ) {
    const w = clamp(((input.taxa_erro_pct || 0) - 15) * 0.6, 4, 12);
    score += w;
    interacoes.push('Erro alto e acelerando — risco composto (não só nível).');
    pushSignal(signals, {
      id: 'erro-acelerando',
      module: 'correcao',
      severity: 'high',
      weight: w,
      label: 'Erro acelerando',
      detail: 'Interação: taxa elevada + tendência positiva',
      action: { label: 'Ver erros', href: '/erros' },
    });
  }

  if ((input.erro_concentracao_pct ?? 0) >= 40) {
    const w = clamp((input.erro_concentracao_pct! - 35) * 0.5, 6, 16);
    score += w;
    pushSignal(signals, {
      id: 'erro-concentrado',
      module: 'correcao',
      severity: input.erro_concentracao_pct! >= 55 ? 'high' : 'medium',
      weight: w,
      label: 'Erro concentrado em 1 supervisor',
      detail: `${input.erro_concentracao_pct}% dos erros em um único time`,
      action: { label: 'Ver erros', href: '/erros' },
    });
  }

  if ((input.atestados_pendentes ?? 0) > 5) {
    const w = clamp((input.atestados_pendentes! - 5) * 2, 5, 18);
    score += w;
    pushSignal(signals, {
      id: 'atestados-fila',
      module: 'atestados',
      severity: 'medium',
      weight: w,
      label: 'Fila de atestados no DP',
      detail: `${input.atestados_pendentes} pendentes`,
      action: { label: 'Abrir atestados', href: '/atestados' },
    });
  }

  if ((input.inss_alertas ?? 0) > 0) {
    const w = clamp(input.inss_alertas! * 4, 8, 22);
    score += w;
    pushSignal(signals, {
      id: 'inss-sla',
      module: 'atestados',
      severity: 'high',
      weight: w,
      label: 'Alertas INSS (>15 dias)',
      detail: `${input.inss_alertas} atestado(s)`,
      action: { label: 'Revisar INSS', href: '/atestados' },
    });
  }

  if ((input.advertencias_pendentes ?? 0) > 3) {
    const w = clamp((input.advertencias_pendentes! - 3) * 3, 5, 20);
    score += w;
    pushSignal(signals, {
      id: 'adv-pendente',
      module: 'advertencias',
      severity: 'medium',
      weight: w,
      label: 'Advertências aguardando DP',
      detail: `${input.advertencias_pendentes} pendente(s)`,
      action: { label: 'Controle DP', href: '/controle-dp' },
    });
  }

  if ((input.advertencias_criticos ?? 0) > 0) {
    const w = clamp(input.advertencias_criticos! * 6, 10, 25);
    score += w;
    pushSignal(signals, {
      id: 'adv-critico',
      module: 'advertencias',
      severity: 'critical',
      weight: w,
      label: 'Advertências críticas',
      detail: `${input.advertencias_criticos} caso(s) crítico(s)`,
      action: { label: 'Ver advertências', href: '/controle-dp' },
    });
  }

  if ((input.eva_stale_min ?? 0) > 5) {
    const w = clamp((input.eva_stale_min! - 5) * 2, 5, 20);
    score += w;
    pushSignal(signals, {
      id: 'eva-stale',
      module: 'eva',
      severity: input.eva_stale_min! > 15 ? 'high' : 'medium',
      weight: w,
      label: 'Dados EVA desatualizados',
      detail: `live.json há ${input.eva_stale_min} min`,
      action: { label: 'Abrir operação', href: '/operacao' },
    });
  }

  if ((input.eva_drop_pct ?? 0) >= 12) {
    const w = clamp((input.eva_drop_pct! - 10) * 1.2, 6, 18);
    score += w;
    pushSignal(signals, {
      id: 'eva-drop',
      module: 'hora',
      severity: input.eva_drop_pct! >= 18 ? 'high' : 'medium',
      weight: w,
      label: 'DROP agente elevado',
      detail: `DROP agente ${input.eva_drop_pct}% (bit Agente Desligou)`,
      action: { label: 'Abrir Hora a hora', href: '/hora' },
    });
  }

  if ((input.portabilidade_p0 ?? 0) > 0) {
    const w = clamp(input.portabilidade_p0! * 5, 10, 30);
    score += w;
    pushSignal(signals, {
      id: 'port-p0',
      module: 'disparos',
      severity: input.portabilidade_p0! > 5 ? 'critical' : 'high',
      weight: w,
      label: 'Portabilidade P0',
      detail: `${input.portabilidade_p0} item(ns) crítico(s)`,
      action: { label: 'Abrir disparos', href: '/disparos' },
    });
  }

  if ((input.portabilidade_fila ?? 0) > 50) {
    const w = clamp((input.portabilidade_fila! - 50) / 5, 5, 15);
    score += w;
    pushSignal(signals, {
      id: 'port-fila',
      module: 'disparos',
      severity: 'medium',
      weight: w,
      label: 'Fila portabilidade elevada',
      detail: `${input.portabilidade_fila} pendente(s)`,
      action: { label: 'Funil portabilidade', href: '/disparos' },
    });
  }

  if ((input.portabilidade_mais_24h ?? 0) >= 20) {
    const w = clamp((input.portabilidade_mais_24h! - 15) / 4, 6, 16);
    score += w;
    pushSignal(signals, {
      id: 'port-envelhecido',
      module: 'disparos',
      severity: input.portabilidade_mais_24h! >= 80 ? 'high' : 'medium',
      weight: w,
      label: 'Fila envelhecida (>24h)',
      detail: `${input.portabilidade_mais_24h} pendente(s) há mais de 24h`,
      action: { label: 'Abrir disparos', href: '/disparos' },
    });
  }

  if ((input.portabilidade_bko ?? 0) >= 80) {
    const w = clamp((input.portabilidade_bko! - 60) / 8, 5, 14);
    score += w;
    pushSignal(signals, {
      id: 'port-bko',
      module: 'disparos',
      severity: 'medium',
      weight: w,
      label: 'BKO de ativação alto',
      detail: `${input.portabilidade_bko} em BKO`,
      action: { label: 'Fila activate', href: '/disparos' },
    });
  }

  if ((input.portabilidade_falha ?? 0) >= 15) {
    const w = clamp((input.portabilidade_falha! - 10) / 3, 5, 14);
    score += w;
    pushSignal(signals, {
      id: 'port-falha',
      module: 'disparos',
      severity: 'medium',
      weight: w,
      label: 'Falhas recentes na fila',
      detail: `${input.portabilidade_falha} com status falha`,
      action: { label: 'Abrir disparos', href: '/disparos' },
    });
  }

  if (input.sms_sucesso_pct != null && input.sms_sucesso_pct < 55) {
    const w = clamp((55 - input.sms_sucesso_pct) * 0.8, 6, 16);
    score += w;
    pushSignal(signals, {
      id: 'sms-baixa',
      module: 'sms',
      severity: input.sms_sucesso_pct < 40 ? 'high' : 'medium',
      weight: w,
      label: 'SMS prévio com baixa conversão',
      detail: `${input.sms_sucesso_pct}% de sucesso consolidado`,
      action: { label: 'Abrir SMS', href: '/sms' },
    });
  }

  if ((input.cpc_pct ?? 99) < metaCpc - 5 && (input.portabilidade_fila ?? 0) > 80) {
    interacoes.push('CPC baixo + fila cheia: operação compete com portabilidade — priorizar P0 e coaching.');
  }

  score = Math.round(clamp(score, 0, 100));
  const level: RiskSeverity =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';

  signals.sort((a, b) => b.weight - a.weight);

  const pesoTotal = signals.reduce((a, s) => a + s.weight, 0) || 1;
  const contribuicoes: RiskContribuicao[] = signals.map((s) => ({
    id: s.id,
    label: s.label,
    weight: Math.round(s.weight * 10) / 10,
    pct: Math.round((1000 * s.weight) / pesoTotal) / 10,
  }));

  const top = signals.slice(0, 3).map((s) => s.label);
  const resumo =
    top.length === 0
      ? 'Operação dentro dos parâmetros esperados.'
      : `Atenção: ${top.join(' · ')}.`;
  const foco = signals[0]?.label || 'Sem foco crítico — manter ritmo.';

  return { score, level, signals, resumo, contribuicoes, interacoes, foco };
}

export function simulateWhatIf(input: WhatIfInput): WhatIfResult {
  const rem = Math.max(0, input.operadores_removidos);
  const nGiven = Number(input.n_operadores);
  const nOps = Number.isFinite(nGiven) && nGiven > 0 ? Math.max(nGiven, rem) : 0;
  const remaining = nOps > 0 ? Math.max(0, nOps - rem) : 0;
  const perdaBruta = rem * input.cpc_por_operador_hora * input.horas_restantes;
  const elasticidade = clamp(input.elasticidade ?? 0.35, 0, 0.8);
  const absorvido =
    remaining > 0 ? perdaBruta * elasticidade * Math.min(1, remaining / Math.max(nOps, 1)) : 0;
  const perda = Math.max(0, perdaBruta - absorvido);
  const mu = input.vendas_atuais - perda;
  const sigma = Math.max(perda * 0.35, input.vendas_atuais * 0.08, 1);
  const p10 = Math.round(mu - 1.2816 * sigma);
  const p50 = Math.round(mu);
  const p90 = Math.round(mu + 1.2816 * sigma);
  const zMeta = (input.meta_dia - mu) / sigma;
  const pHit = Math.round((1 - normalCdf(zMeta)) * 1000) / 10;
  const gap = p50 - input.meta_dia;
  const impacto =
    input.vendas_atuais > 0 ? Math.round((perda / input.vendas_atuais) * 1000) / 10 : 0;
  const horasFila =
    input.minutos_medio_resolucao > 0
      ? Math.round(((input.fila_portabilidade * input.minutos_medio_resolucao) / 60) * 10) / 10
      : 0;
  const capacidadeHora = Math.round(remaining * input.cpc_por_operador_hora * 10) / 10;
  const backlogVsJanela =
    input.horas_restantes > 0 ? Math.round((horasFila / input.horas_restantes) * 10) / 10 : horasFila;

  let recomendacao = 'Cenário estável — manter ritmo atual.';
  if (pHit < 35) {
    recomendacao =
      rem > 0
        ? `P(meta)=${pHit}% — evitar retirar ${rem} operador(es). P50 ${p50} vs meta ${input.meta_dia}.`
        : `P(meta)=${pHit}% — reforçar CPC nas próximas ${input.horas_restantes}h (P50 ${p50}).`;
  } else if (gap < -10) {
    recomendacao =
      rem > 0
        ? `Evitar retirar ${rem} operador(es): gap projetado ${gap} vendas vs meta.`
        : `Gap de ${Math.abs(gap)} vendas — reforçar coaching CPC nas próximas ${input.horas_restantes}h.`;
  } else if (horasFila > input.horas_restantes) {
    recomendacao = `Fila portabilidade (${horasFila}h de backlog) pode competir com vendas — priorizar P0.`;
  } else if (pHit >= 70) {
    recomendacao = `P(meta)=${pHit}% — cenário favorável. Usar folga para fila envelhecida.`;
  }

  return {
    vendas_projetadas: p50,
    gap_meta: gap,
    impacto_cpc_pct: impacto,
    horas_fila_extra: horasFila,
    recomendacao,
    cenarios: { otimista: p90, realista: p50, pessimista: p10 },
    p10,
    p50,
    p90,
    p_atingir_meta: clamp(pHit, 0, 100),
    capacidade_hora: capacidadeHora,
    backlog_vs_janela: backlogVsJanela,
  };
}

export function triagePortabilidade(input: TriageInput): TriageResult {
  const motivos: string[] = [];
  let classificacao: TriageResult['classificacao'] = 'indefinido';
  let confianca = 0.4;
  let acao = 'Revisar manualmente no Disparos.';
  let auto = false;

  const idade = input.idade_horas ?? 0;
  const tentativas = input.tentativas ?? 0;
  const erro = (input.ultimo_erro || '').toLowerCase();
  const status = (input.status || '').toLowerCase();
  const blob = `${erro} ${status}`;

  if (/\bunknown\b|pending_analysis|evaluate_return|matrix_unknown/.test(blob)) {
    return {
      classificacao: 'operacional',
      confianca: 0.9,
      acao_sugerida: 'IGNORAR — matrix unknown; não tratar como recusa nem reenfileirar.',
      auto_executavel: false,
      motivos: ['evaluate_return unknown → IGNORAR'],
    };
  }

  if (blob.includes('cpf')) {
    classificacao = 'operacional';
    confianca = 0.9;
    acao = 'Não reenfileirar — CPF inválido (ALWAYS_IGNORE). Corrigir cadastro no iSize.';
    motivos.push('Motivo de recusa: CPF inválido');
  } else if (blob.includes('restri')) {
    classificacao = 'operacional';
    confianca = 0.88;
    acao = 'Skip — restrição cadastral. Não compete com a janela de reconsulta.';
    motivos.push('Restrição / ALWAYS_IGNORE');
  } else if (blob.includes('vago')) {
    classificacao = 'cliente';
    confianca = 0.86;
    acao = 'Número vago — encerrar ciclo, sem nova abertura.';
    motivos.push('Número vago');
  } else if (blob.includes('fraude')) {
    classificacao = 'cliente';
    confianca = 0.92;
    acao = 'Fraude — não reabrir. Registrar e seguir política de compliance.';
    motivos.push('Indício de fraude');
  } else if (
    (blob.includes('rejeic') || blob.includes('rejeição')) &&
    blob.includes('sms')
  ) {
    classificacao = 'cliente';
    confianca = 0.84;
    acao = 'Rejeição SMS — contato ativo só se o cliente pediu; senão IGNORAR.';
    motivos.push('Rejeição de SMS pelo cliente');
  } else if (blob.includes('conflito') && (blob.includes('data') || blob.includes('passada'))) {
    classificacao = 'operacional';
    confianca = 0.8;
    acao = 'Reagendar (não cancelar) — conflito de data / data passada.';
    motivos.push('Conflito de data — matrix aponta reschedule');
  } else if (blob.includes('cliente') || blob.includes('recusa') || status.includes('cancel')) {
    classificacao = 'cliente';
    confianca = 0.82;
    acao = 'Contato ativo com cliente — validar intenção antes de reenfileirar.';
    motivos.push('Erro/status indica recusa ou cancelamento do cliente');
  } else if (erro.includes('bko') || erro.includes('backoffice') || input.tem_os === false) {
    classificacao = 'bko';
    confianca = 0.78;
    acao = 'Escalar BKO — verificar OS/documentação pendente.';
    motivos.push('BKO ou ausência de OS');
  } else if (erro.includes('timeout') || erro.includes('sistema') || erro.includes('indispon')) {
    classificacao = 'sistema';
    confianca = 0.85;
    acao = 'Reenfileirar após janela — falha sistêmica transitória.';
    auto = tentativas < 2 && idade < 24;
    motivos.push('Indício de falha sistêmica');
  } else if (idade > 48 && tentativas >= 3) {
    classificacao = 'operacional';
    confianca = 0.75;
    acao = 'Auditar cadastro e histórico de tentativas — possível erro operacional.';
    motivos.push('SLA estourado com múltiplas tentativas');
  } else if (input.tem_ticket && idade < 12) {
    classificacao = 'operacional';
    confianca = 0.7;
    acao = 'Acompanhar ticket aberto — aguardar retorno antes de nova ação.';
    motivos.push('Ticket recente em andamento');
  } else {
    classificacao = 'indefinido';
    confianca = 0.45;
    acao = 'Classificação inconclusiva — usar fatia no Disparos para detalhar.';
    motivos.push('Sinais insuficientes para classificação automática');
  }

  return {
    classificacao,
    confianca: Math.round(confianca * 100) / 100,
    acao_sugerida: acao,
    auto_executavel: auto,
    motivos,
  };
}

export function searchKnowledge(
  chunks: KnowledgeChunk[],
  query: string,
  limit = 8,
): KnowledgeChunk[] {
  const q = query.trim().toLowerCase();
  if (!q) return chunks.slice(0, limit);

  const terms = q.split(/\s+/).filter(Boolean);
  const df = new Map<string, number>();
  const blobs = chunks.map((c) => `${c.titulo} ${c.conteudo} ${c.categoria} ${c.tags.join(' ')}`.toLowerCase());
  for (const t of terms) {
    df.set(t, blobs.filter((b) => b.includes(t)).length);
  }
  const n = Math.max(chunks.length, 1);

  const scored = chunks.map((c, i) => {
    const blob = blobs[i];
    let score = 0;
    for (const t of terms) {
      if (!blob.includes(t)) continue;
      const tf = blob.split(t).length - 1;
      const idf = Math.log(1 + n / (1 + (df.get(t) || 0)));
      score += (t.length > 3 ? 2.2 : 1) * (1 + Math.log(1 + tf)) * idf;
    }
    if (c.titulo.toLowerCase().includes(q)) score += 6;
    for (const tag of c.tags) {
      if (terms.includes(tag.toLowerCase())) score += 2;
    }
    return { ...c, score: Math.round(score * 100) / 100 };
  });

  return scored
    .filter((c) => (c.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export function buildCopilotContext(payload: {
  page?: string;
  risk?: RiskRadarResult;
  analytics?: Record<string, unknown>;
  live?: Record<string, unknown>;
  question: string;
}): string {
  const analytics = payload.analytics || {};
  const porSup = Array.isArray(analytics.por_supervisor)
    ? (analytics.por_supervisor as Array<Record<string, unknown>>).slice(0, 6)
    : [];
  return JSON.stringify({
    pagina: payload.page || 'inteligencia',
    pergunta: payload.question,
    regras: {
      sms_template_sem_telefone: true,
      unknown_matrix: 'IGNORAR',
      portados_hoje: 'só bilhete (isPortadoComBilhete)',
      corte_tim_sms: 'Concluído sem ticket = sucesso no consolidado',
    },
    risk_score: payload.risk?.score,
    risk_level: payload.risk?.level,
    risk_resumo: payload.risk?.resumo,
    risk_foco: payload.risk?.foco,
    risk_interacoes: payload.risk?.interacoes,
    contribuicoes: payload.risk?.contribuicoes?.slice(0, 6),
    top_sinais: payload.risk?.signals?.slice(0, 6).map((s) => ({
      modulo: s.module,
      label: s.label,
      detail: s.detail,
      peso: s.weight,
    })),
    analytics: {
      periodo: analytics.periodo,
      total: analytics.total,
      taxa_erro_pct: analytics.taxa_erro_pct,
      taxa_erro_tendencia: analytics.taxa_erro_tendencia,
      top_erro: analytics.top_erro,
      tempo_medio_ms: analytics.tempo_medio_ms,
      concentracao_erro_pct: analytics.concentracao_erro_pct,
      pareto_erro: analytics.pareto_erro,
      outliers_supervisor: analytics.outliers_supervisor,
      por_supervisor: porSup,
    },
    live: payload.live || null,
  });
}
