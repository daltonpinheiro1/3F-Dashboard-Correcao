import { describe, expect, it } from 'vitest';
import { BASE_TIM_NOTA, deltaTaxa, fmtDelta } from './disparosFormat';

describe('fmtDelta / deltaTaxa', () => {
  it('taxa ausente no histórico mostra "—" em vez de número falso', () => {
    expect(fmtDelta(deltaTaxa(null, 5), ' pp')).toBe('—');
    expect(fmtDelta(null)).toBe('—');
    expect(fmtDelta(undefined)).toBe('—');
  });

  it('mantém formato com sinal', () => {
    expect(fmtDelta(deltaTaxa(7.25, 5), ' pp')).toBe('+2.3 pp');
    expect(fmtDelta(-3)).toBe('-3');
    expect(fmtDelta(0)).toBe('0');
  });

  it('nota base_tim deixa claro que não entra no sucesso TIM', () => {
    expect(BASE_TIM_NOTA).toMatch(/sem bilhete/);
    expect(BASE_TIM_NOTA).toMatch(/não entra no sucesso TIM/);
  });
});
