import { describe, expect, it } from 'vitest';
import { normPropostaKey } from './portabilidadePropostaKey';

/** Mesmo passo a passo do CASE de public.portabilidade_norm_key (043). */
function normKeySql(raw: string | null): string {
  const s = (raw ?? '').replace(/^\s+|\s+$/g, '');
  const digits = s.replace(/^3F-/i, '');
  if (s === '') return '';
  if (/^[0-9]+$/.test(digits)) return `3F-${digits}`;
  if (s.slice(0, 3) === '3F-') return s;
  return `3F-${s}`;
}

const CASOS = [null, '', '   ', '123', '3F-123', '3f-123', ' 3F-00123 ', 'ABC', '3F-ABC', '3f-ABC', '3F-', 'X-1'];

describe('normPropostaKey ↔ portabilidade_norm_key (043)', () => {
  it.each(CASOS)('%j → mesma chave no TS e no SQL', (raw) => {
    expect(normKeySql(raw)).toBe(normPropostaKey(raw));
  });

  it('3F-N e N viram a mesma chave', () => {
    expect(normPropostaKey('123')).toBe(normPropostaKey('3F-123'));
  });
});
