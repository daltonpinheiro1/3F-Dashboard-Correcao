import { describe, expect, it } from 'vitest';
import {
  timelineActiveLabel,
  timelineStepsFromProgress,
} from './consultaTimTimeline';
import type { ScoreTimResult } from './scoreTimService';

function p(over: Partial<ScoreTimResult>): ScoreTimResult {
  return { query_id: 'q', status: 'PROCESSING', ...over };
}

describe('consultaTimTimeline', () => {
  it('sem progresso: Fila ativa', () => {
    const s = timelineStepsFromProgress(null);
    expect(s[0].state).toBe('active');
    expect(s.slice(1).every((x) => x.state === 'pending')).toBe(true);
  });

  it('QUEUED marca Fila ativa', () => {
    const s = timelineStepsFromProgress(
      p({ status: 'QUEUED', phase: 'QUEUED', wait_reason: 'QUEUED' }),
    );
    expect(s[0].state).toBe('active');
  });

  it('SSO/AUTH frio marca Sessão ativa e Fila done', () => {
    const s = timelineStepsFromProgress(
      p({
        status: 'PROCESSING',
        phase: 'AUTH',
        wait_reason: 'SSO',
        session_hot: false,
      }),
    );
    expect(s[0].state).toBe('done');
    expect(s[1].state).toBe('active');
    expect(s[2].state).toBe('pending');
  });

  it('session_hot + phase AUTH não regride para Sessão', () => {
    const s = timelineStepsFromProgress(
      p({
        status: 'PROCESSING',
        phase: 'AUTH',
        wait_reason: 'NETWORK_RETRY',
        session_hot: true,
      }),
    );
    expect(s[1].state).toBe('done');
    expect(s[2].state).toBe('active');
  });

  it('QUERY marca Crivo ativo', () => {
    const s = timelineStepsFromProgress(
      p({
        status: 'PROCESSING',
        phase: 'QUERY',
        wait_reason: 'QUERY',
        session_hot: true,
      }),
    );
    expect(s[2].state).toBe('active');
    expect(timelineActiveLabel(p({ phase: 'QUERY', wait_reason: 'QUERY', session_hot: true }))).toBe(
      'Crivo',
    );
  });

  it('terminal marca todos done', () => {
    const s = timelineStepsFromProgress(
      p({ status: 'APPROVED', score: 70, outcome_code: 'SCORE_APROVADO' }),
    );
    expect(s.every((x) => x.state === 'done')).toBe(true);
  });
});
