export type ScoreFactor = {
  code: string;
  title: string;
  detail: string;
  /** suggestion for operator when actionable */
  cta?: string;
};

const FACTORS: Record<string, Omit<ScoreFactor, 'code'>> = {
  SCORE_APROVADO: {
    title: 'Crédito aprovado',
    detail: 'Cliente aprovado na Consulta 2 (Crivo TIM).',
  },
  REPROVADO_SCORE_ABAIXO_35: {
    title: 'Score abaixo do mínimo',
    detail: 'Score Crivo inferior ao limiar de aprovação (35).',
  },
  PERFIL_PRE_PAGO: {
    title: 'Perfil pré-pago',
    detail: 'Cliente classificado com perfil pré-pago na base TIM.',
  },
  RESTRICAO_MERCADO: {
    title: 'Restrição no mercado',
    detail: 'Há restrição cadastral/mercado que impede a oferta.',
  },
  NOME_MAE_DIVERGENTE: {
    title: 'Nome da mãe divergente',
    detail: 'O nome da mãe informado não confere com a base.',
    cta: 'Corrija o nome da mãe e reconsulte.',
  },
  NASCIMENTO_DIVERGENTE: {
    title: 'Nascimento divergente',
    detail: 'A data de nascimento informada não confere com a base.',
    cta: 'Corrija a data de nascimento e reconsulte.',
  },
  PENDENCIA_FINANCEIRA_TIM: {
    title: 'Pendência financeira TIM',
    detail: 'Cliente com pendência financeira na TIM.',
  },
  CRIVO_TIM_INSTAVEL: {
    title: 'Crivo TIM instável',
    detail: 'Falha de comunicação com o Crivo — tente novamente em instantes.',
    cta: 'Aguarde e reconsulte (falha operacional, não é reprovação).',
  },
  FALHA_OPERACIONAL: {
    title: 'Falha operacional',
    detail: 'Sessão/RSA/rede impediu a consulta. Não é um desfecho de crédito.',
    cta: 'Tente novamente em instantes.',
  },
  INDETERMINADO: {
    title: 'Indeterminado',
    detail: 'O Crivo não devolveu um desfecho claro.',
    cta: 'Reconsulte o CPF.',
  },
  CLIENT_ACCOUNT_NOT_FOUND: {
    title: 'Conta não encontrada',
    detail: 'Siebel não localizou a conta do cliente na busca.',
  },
  TELA_INICIAL_SEM_CONTA: {
    title: 'Tela inicial sem conta',
    detail: 'Fluxo Siebel voltou à tela inicial sem conta carregada.',
    cta: 'Reconsulte; se persistir, verifique sessão.',
  },
  FORA_HORARIO_COMERCIAL: {
    title: 'Fora do horário',
    detail: 'Consultas aceitas de segunda a sábado, 08:00–22:00.',
  },
  REPROVADO_OUTRO: {
    title: 'Reprovado',
    detail: 'Crivo reprovou sem categoria específica.',
  },
};

function normalizeAtom(raw: string): string {
  const u = raw.trim().toUpperCase();
  if (u.includes('PRE_PAGO') || u.includes('PRÉ-PAGO') || u.includes('PRE-PAGO')) {
    return 'PERFIL_PRE_PAGO';
  }
  if (u.includes('RESTRICAO') || u.includes('RESTRIÇÃO')) return 'RESTRICAO_MERCADO';
  if (u.includes('MAE') || u.includes('MÃE')) return 'NOME_MAE_DIVERGENTE';
  if (u.includes('NASCIMENTO')) return 'NASCIMENTO_DIVERGENTE';
  if (u.includes('CRIVO')) return 'CRIVO_TIM_INSTAVEL';
  if (u.includes('PENDENCIA') || u.includes('PENDÊNCIA')) {
    return 'PENDENCIA_FINANCEIRA_TIM';
  }
  if (u.includes('SCORE') && (u.includes('35') || u.includes('BAIXO'))) {
    return 'REPROVADO_SCORE_ABAIXO_35';
  }
  if (u.includes('APROVADO') || u === 'SCORE_APROVADO') return 'SCORE_APROVADO';
  if (FACTORS[u]) return u;
  return u;
}

/** Quebra outcome_code composto (A+B) em átomos conhecidos. */
export function splitOutcomeCodes(outcomeCode?: string | null): string[] {
  if (!outcomeCode || !String(outcomeCode).trim()) return [];
  return String(outcomeCode)
    .split('+')
    .map((p) => normalizeAtom(p))
    .filter(Boolean);
}

export function explainScoreOutcome(opts: {
  status?: string | null;
  outcome_code?: string | null;
  rejection_reason?: string | null;
}): { headline: string; factors: ScoreFactor[] } {
  const status = (opts.status || '').toUpperCase();
  const atoms = splitOutcomeCodes(opts.outcome_code);
  const factors: ScoreFactor[] = [];
  const seen = new Set<string>();

  for (const code of atoms) {
    if (seen.has(code)) continue;
    seen.add(code);
    const meta = FACTORS[code];
    if (meta) {
      factors.push({ code, ...meta });
    } else if (code.length > 2) {
      factors.push({
        code,
        title: code.replace(/_/g, ' ').toLowerCase(),
        detail: opts.rejection_reason?.trim() || 'Motivo reportado pelo Crivo.',
      });
    }
  }

  if (factors.length === 0) {
    if (status === 'APPROVED') {
      factors.push({ code: 'SCORE_APROVADO', ...FACTORS.SCORE_APROVADO });
    } else if (status === 'REJECTED') {
      factors.push({
        code: 'REPROVADO_OUTRO',
        ...FACTORS.REPROVADO_OUTRO,
        detail: opts.rejection_reason?.trim() || FACTORS.REPROVADO_OUTRO.detail,
      });
    } else if (status === 'FAILED') {
      factors.push({ code: 'FALHA_OPERACIONAL', ...FACTORS.FALHA_OPERACIONAL });
    }
  }

  const headline =
    factors[0]?.title ||
    (status === 'APPROVED'
      ? 'Aprovado'
      : status === 'REJECTED'
        ? 'Reprovado'
        : status || 'Resultado');

  return { headline, factors: factors.slice(0, 3) };
}
