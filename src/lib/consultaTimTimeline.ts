import type { ScoreTimResult } from './scoreTimService';
import { isTerminalStatus } from './scoreTimService';

export type TimelineStepId = 'queued' | 'auth' | 'query' | 'done';

export type TimelineStep = {
  id: TimelineStepId;
  label: string;
  /** pending | active | done */
  state: 'pending' | 'active' | 'done';
};

/**
 * Passos da consulta a partir de phase/wait_reason.
 * Nunca regride AUTH se session_hot (AUTH quente = rede, não SSO).
 */
export function timelineStepsFromProgress(
  partial: ScoreTimResult | null,
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { id: 'queued', label: 'Fila', state: 'pending' },
    { id: 'auth', label: 'Sessão', state: 'pending' },
    { id: 'query', label: 'Crivo', state: 'pending' },
    { id: 'done', label: 'Desfecho', state: 'pending' },
  ];
  if (!partial) {
    steps[0].state = 'active';
    return steps;
  }

  const st = (partial.status || '').toUpperCase();
  if (isTerminalStatus(st)) {
    return steps.map((s) => ({ ...s, state: 'done' as const }));
  }

  const wait = (partial.wait_reason || '').toUpperCase();
  const phase = (partial.phase || '').toUpperCase();
  const hot = partial.session_hot === true;
  const authCold =
    wait === 'SESSION_REFRESH' ||
    wait === 'SSO' ||
    (phase === 'AUTH' && !hot);

  if (st === 'QUEUED' || wait === 'QUEUED' || phase === 'QUEUED') {
    steps[0].state = 'active';
    return steps;
  }

  // PROCESSING
  steps[0].state = 'done';
  if (authCold) {
    steps[1].state = 'active';
    return steps;
  }
  // Sessão quente ou QUERY / NETWORK_RETRY
  steps[1].state = 'done';
  steps[2].state = 'active';
  return steps;
}

export function timelineActiveLabel(partial: ScoreTimResult | null): string {
  const steps = timelineStepsFromProgress(partial);
  const active = steps.find((s) => s.state === 'active');
  return active?.label || 'Aguardando';
}
