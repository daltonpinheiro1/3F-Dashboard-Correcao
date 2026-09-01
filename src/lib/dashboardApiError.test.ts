import { describe, expect, it } from 'vitest';
import { throwDashboardApiError } from './dashboardApiError';

describe('throwDashboardApiError', () => {
  it('401 mantém api e sugere logout quando mensagem não menciona sessão', () => {
    let mode: string | undefined;
    expect(() =>
      throwDashboardApiError(401, { error: 'Não autorizado.' }, 'x', (m) => {
        mode = m;
      }),
    ).toThrow(/logout\/login/i);
    expect(mode).toBe('api');
  });

  it('401 preserva mensagem que já menciona sessão', () => {
    expect(() => throwDashboardApiError(401, { error: 'Sessão inválida.' }, 'x')).toThrow(
      'Sessão inválida.',
    );
  });

  it('403 não sugere logout', () => {
    expect(() => throwDashboardApiError(403, { error: 'Acesso restrito a admin.' }, 'x')).toThrow(
      'Acesso restrito a admin.',
    );
  });

  it('503 não marca offline', () => {
    let mode: string | undefined;
    expect(() =>
      throwDashboardApiError(503, { error: 'Tabela indisponível.' }, 'x', (m) => {
        mode = m;
      }),
    ).toThrow('Tabela indisponível.');
    expect(mode).toBe('api');
  });

  it('504 marca offline', () => {
    let mode: string | undefined;
    expect(() =>
      throwDashboardApiError(504, { error: 'Gateway timeout' }, 'x', (m) => {
        mode = m;
      }),
    ).toThrow('Gateway timeout');
    expect(mode).toBe('offline');
  });
});
