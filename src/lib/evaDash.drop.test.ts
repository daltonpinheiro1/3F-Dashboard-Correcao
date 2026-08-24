import { describe, expect, it } from 'vitest';
import { dropPorLogin, dropRate, isTabDrop, maskPhoneDisplay } from './evaDash';

describe('DROP helpers (regressão Discagens/Operação/Chamadas)', () => {
  it('isTabDrop cobre DESLIGOU e QUEDA', () => {
    expect(isTabDrop('12 - DESLIGOU SEM OUVIR PROPOSTA')).toBe(true);
    expect(isTabDrop('16 - QUEDA DE LIGAÇÃO')).toBe(true);
    expect(isTabDrop('CLIENTE DESLIGOU')).toBe(true);
    expect(isTabDrop('26 - SEM INTERESSE')).toBe(false);
    expect(isTabDrop('22 - CAIXA POSTAL')).toBe(false);
  });

  it('dropRate arredonda em 1 casa', () => {
    expect(dropRate(0, 0)).toBe(0);
    expect(dropRate(1, 3)).toBe(33.3);
    expect(dropRate(22, 43)).toBe(51.2);
  });

  it('dropPorLogin agrega por login', () => {
    const m = dropPorLogin([
      { login: 'op1', nome: '12 - DESLIGOU', total: 10 },
      { login: 'op1', nome: 'SEM INTERESSE', total: 10 },
      { login: 'op2', nome: 'QUEDA DE LIGAÇÃO', total: 5 },
    ]);
    expect(m.op1.drop).toBe(10);
    expect(m.op1.tabs).toBe(20);
    expect(m.op1.rate).toBe(50);
    expect(m.op2.drop).toBe(5);
    expect(m.op2.rate).toBe(100);
  });

  it('maskPhoneDisplay mascara dígitos', () => {
    expect(maskPhoneDisplay(11, '999887766')).toBe('(11) *****7766');
    expect(maskPhoneDisplay(null, '****7766')).toBe('****7766');
    expect(maskPhoneDisplay(null, null)).toBe('—');
  });
});
