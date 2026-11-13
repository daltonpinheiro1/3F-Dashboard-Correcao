import { describe, expect, it } from 'vitest';
import {
  isAuthCold,
  pollIntervalMs,
  type ScoreTimResult,
} from './scoreTimService';

function partial(over: Partial<ScoreTimResult>): ScoreTimResult {
  return { query_id: 'q', status: 'PROCESSING', ...over };
}

describe('poll adaptativo Consulta TIM', () => {
  it('fila com gente na frente fica em 2s', () => {
    expect(
      pollIntervalMs(partial({ status: 'QUEUED', queue_ahead: 3 })),
    ).toBe(2000);
  });

  it('próximo da fila acelera para 1s', () => {
    expect(
      pollIntervalMs(partial({ status: 'QUEUED', queue_ahead: 0 })),
    ).toBe(1000);
  });

  it('AUTH frio usa 1,5s (não martela RSA)', () => {
    expect(
      pollIntervalMs(
        partial({
          status: 'PROCESSING',
          phase: 'AUTH',
          wait_reason: 'SSO',
          session_hot: false,
        }),
      ),
    ).toBe(1500);
    expect(
      isAuthCold(
        partial({ phase: 'AUTH', wait_reason: 'SESSION_REFRESH', session_hot: false }),
      ),
    ).toBe(true);
  });

  it('QUERY quente e ahead 0 usa 500ms (fecha gap bot→tela)', () => {
    expect(
      pollIntervalMs(
        partial({
          status: 'PROCESSING',
          phase: 'QUERY',
          wait_reason: 'QUERY',
          session_hot: true,
          queue_ahead: 0,
        }),
      ),
    ).toBe(500);
  });

  it('QUERY sem hot usa 800ms', () => {
    expect(
      pollIntervalMs(
        partial({
          status: 'PROCESSING',
          phase: 'QUERY',
          wait_reason: 'QUERY',
          session_hot: false,
        }),
      ),
    ).toBe(800);
  });

  it('respeita teto baseMs se o caller passar intervalo menor', () => {
    expect(
      pollIntervalMs(
        partial({
          status: 'PROCESSING',
          wait_reason: 'QUERY',
          session_hot: true,
          queue_ahead: 0,
        }),
        400,
      ),
    ).toBe(400);
  });

  it('hot + phase AUTH não conta como AUTH frio', () => {
    expect(
      isAuthCold(
        partial({ phase: 'AUTH', wait_reason: 'NETWORK_RETRY', session_hot: true }),
      ),
    ).toBe(false);
  });
});
