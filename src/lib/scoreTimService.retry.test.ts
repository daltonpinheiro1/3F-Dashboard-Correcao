import { describe, expect, it } from 'vitest';
import {
  isRetryableEnqueueError,
  isRetryableOperationalFailure,
  type ScoreTimResult,
} from './scoreTimService';

describe('scoreTim operational retry', () => {
  it('detecta FALHA_OPERACIONAL / RSA', () => {
    const r: ScoreTimResult = {
      query_id: 'q1',
      status: 'FAILED',
      outcome_code: 'FALHA_OPERACIONAL',
      rejection_reason:
        'falha ao relogar apos sessao expirada: RSA indisponivel: Timeout: janela RSA não detectada em 10s',
    };
    expect(isRetryableOperationalFailure(r)).toBe(true);
  });

  it('não retenta REJECTED de crédito', () => {
    const r: ScoreTimResult = {
      query_id: 'q2',
      status: 'REJECTED',
      outcome_code: 'REPROVADO',
      rejection_reason: 'score insuficiente',
    };
    expect(isRetryableOperationalFailure(r)).toBe(false);
  });

  it('detecta erro de enqueue operacional', () => {
    expect(isRetryableEnqueueError('RSA indisponivel')).toBe(true);
    expect(isRetryableEnqueueError('CPF inválido')).toBe(false);
  });

  it('trata NOT_FOUND/502 como retentável (restart do bot)', () => {
    expect(isRetryableEnqueueError('Consulta não encontrada ou expirada. Envie novamente.')).toBe(
      true,
    );
    expect(isRetryableEnqueueError('Bad gateway')).toBe(true);
  });

  it('retenta circuit breaker e comunicação Crivo', () => {
    expect(
      isRetryableOperationalFailure({
        query_id: 'q3',
        status: 'FAILED',
        rejection_reason: 'Circuit breaker aberto — consulta q3 rejeitada',
      }),
    ).toBe(true);
    expect(
      isRetryableOperationalFailure({
        query_id: 'q4',
        status: 'FAILED',
        rejection_reason: 'Erro de comunicação com o Crivo. Tentar novamente.',
      }),
    ).toBe(true);
  });
});
