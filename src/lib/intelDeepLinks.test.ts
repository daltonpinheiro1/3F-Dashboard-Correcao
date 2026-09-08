import { describe, expect, it } from 'vitest';
import {
  chamadasOfensorHref,
  inteligenciaCoachingHref,
  outlierCoachingSugestao,
  parseIntelTab,
} from './intelDeepLinks';

describe('intelDeepLinks', () => {
  it('monta coaching e ofensor', () => {
    expect(inteligenciaCoachingHref({ nome: 'Ana', sugestao: 'oi' })).toContain('tab=coaching');
    expect(inteligenciaCoachingHref({ nome: 'Ana' })).toContain('nome=Ana');
    expect(chamadasOfensorHref('Caixa Postal', 'PORTABILIDADE')).toBe(
      '/chamadas?ofensor=Caixa+Postal&campanha_op=PORTABILIDADE',
    );
  });

  it('parseIntelTab ignora lixo', () => {
    expect(parseIntelTab('coaching')).toBe('coaching');
    expect(parseIntelTab('nope')).toBeNull();
  });

  it('template outlier', () => {
    expect(outlierCoachingSugestao({ user_name: 'João', queue_curta: 'MIG', tabuladas: 12, conv_tab: 4 })).toMatch(
      /João/,
    );
  });
});
