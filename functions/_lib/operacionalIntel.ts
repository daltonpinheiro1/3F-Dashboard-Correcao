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
  portabilidade_p0?: number;
  portabilidade_fila?: number;
};

export type RiskRadarResult = {
  score: number;
  level: RiskSeverity;
  signals: RiskSignal[];
  resumo: string;
};

export type WhatIfInput = {
  operadores_removidos: number;
  cpc_por_operador_hora: number;
  horas_restantes: number;
  vendas_atuais: number;
  meta_dia: number;
  fila_portabilidade: number;
  minutos_medio_resolucao: number;
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
  return (tipos || []).some(isErroOperacionalServer);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pushSignal(
  signals: RiskSignal[],
  partial: Omit<RiskSignal, 'weight'> & { weight: number },
) {
  signals.push(partial);
}

export function computeRiskRadar(input: RiskRadarInput): RiskRadarResult {
  const signals: RiskSignal[] = [];
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

  score = Math.round(clamp(score, 0, 100));
  const level: RiskSeverity =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';

  signals.sort((a, b) => b.weight - a.weight);

  const top = signals.slice(0, 3).map((s) => s.label);
  const resumo =
    top.length === 0
      ? 'Operação dentro dos parâmetros esperados.'
      : `Atenção: ${top.join(' · ')}.`;

  return { score, level, signals, resumo };
}

export function simulateWhatIf(input: WhatIfInput): WhatIfResult {
  const rem = Math.max(0, input.operadores_removidos);
  const perdaVendas = rem * input.cpc_por_operador_hora * input.horas_restantes;
  const realista = Math.round(input.vendas_atuais - perdaVendas);
  const otimista = Math.round(realista + perdaVendas * 0.15);
  const pessimista = Math.round(realista - perdaVendas * 0.25);
  const gap = realista - input.meta_dia;
  const impacto =
    input.vendas_atuais > 0
      ? Math.round((perdaVendas / input.vendas_atuais) * 1000) / 10
      : 0;
  const horasFila =
    input.minutos_medio_resolucao > 0
      ? Math.round(((input.fila_portabilidade * input.minutos_medio_resolucao) / 60) * 10) / 10
      : 0;

  let recomendacao = 'Cenário estável — manter ritmo atual.';
  if (gap < -10) {
    recomendacao =
      rem > 0
        ? `Evitar retirar ${rem} operador(es): gap projetado ${gap} vendas vs meta.`
        : `Gap de ${Math.abs(gap)} vendas — reforçar coaching CPC nas próximas ${input.horas_restantes}h.`;
  } else if (horasFila > input.horas_restantes) {
    recomendacao = `Fila portabilidade (${horasFila}h de backlog) pode competir com vendas — priorizar P0.`;
  }

  return {
    vendas_projetadas: realista,
    gap_meta: gap,
    impacto_cpc_pct: impacto,
    horas_fila_extra: horasFila,
    recomendacao,
    cenarios: { otimista, realista, pessimista },
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

  if (erro.includes('cliente') || erro.includes('recusa') || status.includes('cancel')) {
    classificacao = 'cliente';
    confianca = 0.82;
    acao = 'Contato ativo com cliente — validar intenção antes de reenfileirar.';
    motivos.push('Erro/status indica recusa ou cancelamento do cliente');
  } else if (erro.includes('bko') || erro.includes('backoffice') || !input.tem_os) {
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
  const scored = chunks.map((c) => {
    const blob = `${c.titulo} ${c.conteudo} ${c.categoria} ${c.tags.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (blob.includes(t)) score += t.length > 3 ? 3 : 1;
    }
    if (c.titulo.toLowerCase().includes(q)) score += 5;
    return { ...c, score };
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
  question: string;
}): string {
  return JSON.stringify({
    pagina: payload.page || 'inteligencia',
    pergunta: payload.question,
    risk_score: payload.risk?.score,
    risk_resumo: payload.risk?.resumo,
    top_sinais: payload.risk?.signals?.slice(0, 5).map((s) => ({
      modulo: s.module,
      label: s.label,
      detail: s.detail,
    })),
    analytics: payload.analytics,
  });
}
