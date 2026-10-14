import { describe, expect, it } from 'vitest';
import { ceCanonica } from './portabilidade-journey';

describe('ceCanonica', () => {
  it('3F-N e N duplicados: ticket terminal prevalece sobre a 1ª linha devolvida', () => {
    const r = ceCanonica([
      { proposta_isize: '123', ticket_status: 'Conflito', ultimo_retorno_em: '2026-09-20T00:00:00Z' },
      { proposta_isize: '3F-123', ticket_status: 'Portado', ultimo_retorno_em: '2026-09-10T00:00:00Z' },
    ]);
    expect(r?.ticket_status).toBe('Portado');
  });

  it('mesma prioridade: retorno mais recente', () => {
    const r = ceCanonica([
      { proposta_isize: '3F-1', order_status: 'A', ultimo_retorno_em: '2026-09-01T00:00:00Z' },
      { proposta_isize: '1', order_status: 'B', ultimo_retorno_em: '2026-09-05T00:00:00Z' },
    ]);
    expect(r?.order_status).toBe('B');
  });

  it('vazio ou não-lista → null', () => {
    expect(ceCanonica([])).toBeNull();
    expect(ceCanonica(null)).toBeNull();
  });
});
