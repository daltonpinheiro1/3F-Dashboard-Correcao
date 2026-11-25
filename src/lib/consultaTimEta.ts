/**
 * ETA da Consulta TIM a partir do bot (fila × média SLO) ou fallback local.
 *
 * Preferir ``absoluteHint`` (= eta_hint_seconds do poll), que já inclui
 * ceil((ahead+1)/concurrency) × tempo_médio (+ AUTH se sessão fria).
 */
export const SECONDS_PER_QUERY_FALLBACK = 22;

export function perQuerySeconds(hint: number | null | undefined): number {
  // Alinhado ao bot (floor 12 / ceil 120). Floor 45 forçava 1 min na UI.
  if (typeof hint === 'number' && hint > 0) return Math.max(12, Math.min(120, hint));
  return SECONDS_PER_QUERY_FALLBACK;
}

export function etaSeconds(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
  absoluteHint?: number | null,
): number | null {
  if (typeof absoluteHint === 'number' && absoluteHint > 0) {
    return Math.max(1, Math.min(900, absoluteHint));
  }
  if (typeof ahead !== 'number' || ahead < 0) return null;
  const unit = perQuerySeconds(perQueryHint);
  return Math.max(unit, (ahead + 1) * unit);
}

/** Tempo calculado: <60s em segundos; senão minutos inteiros. Sem "~". */
export function etaDurationLabel(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `${s}s`;
  const mins = Math.ceil(s / 60);
  return mins === 1 ? '1 min' : `${mins} min`;
}

/** Texto para a linha de status (só o tempo). */
export function etaHintLabel(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
  absoluteHint?: number | null,
): string | null {
  const sec = etaSeconds(ahead, perQueryHint, absoluteHint);
  if (sec == null) return null;
  return etaDurationLabel(sec);
}

/** Valor curto do cartão "Estimado". */
export function etaCardValue(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
  absoluteHint?: number | null,
): string {
  const sec = etaSeconds(ahead, perQueryHint, absoluteHint);
  if (sec == null) return '—';
  return etaDurationLabel(sec);
}
