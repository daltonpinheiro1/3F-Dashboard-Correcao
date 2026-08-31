import { describe, expect, it } from 'vitest';
import {
  mergeCeRow,
  normPropostaKey,
  ticketPriority,
} from '../../functions/_lib/portabilidadePropostaKey';

describe('normPropostaKey', () => {
  it('normaliza variantes', () => {
    expect(normPropostaKey('12345678')).toBe('3F-12345678');
    expect(normPropostaKey('3F-12345678')).toBe('3F-12345678');
    expect(normPropostaKey('3f-12345678')).toBe('3F-12345678');
  });
});

describe('mergeCeRow', () => {
  it('prefere portado sobre falha parcial', () => {
    const a = {
      proposta_isize: '3F-1',
      ticket_status: 'Falha Parcial',
      ultimo_retorno_em: '2026-08-30T10:00:00Z',
    };
    const b = {
      proposta_isize: '3F-1',
      ticket_status: 'Portado',
      ultimo_retorno_em: '2026-08-29T10:00:00Z',
    };
    expect(mergeCeRow(a, b).ticket_status).toBe('Portado');
  });

  it('desempata por ultimo_retorno_em', () => {
    const old = {
      proposta_isize: '3F-2',
      ticket_status: 'Portabilidade Pendente',
      ultimo_retorno_em: '2026-08-01T00:00:00Z',
    };
    const newer = {
      proposta_isize: '3F-2',
      ticket_status: 'Conflito',
      ultimo_retorno_em: '2026-08-20T00:00:00Z',
    };
    expect(mergeCeRow(old, newer).ticket_status).toBe('Conflito');
  });
});

describe('ticketPriority', () => {
  it('ordena terminais', () => {
    expect(ticketPriority('Portado')).toBeGreaterThan(ticketPriority('Falha Parcial'));
    expect(ticketPriority('Falha Parcial')).toBeGreaterThan(
      ticketPriority('Portabilidade Cancelada'),
    );
  });
});
