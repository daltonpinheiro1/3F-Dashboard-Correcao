import { describe, expect, it } from 'vitest';
import {
  brMobileError,
  formatBrMobile,
  isValidBrMobile,
  isValidCpf,
  normalizeBirthDate,
  phoneDigits,
  ufFromPhone,
  cpfError,
  birthDateError,
} from './brIdentity';

describe('brIdentity', () => {
  it('formata e valida celular SP', () => {
    expect(formatBrMobile('11987654321')).toBe('(11) 98765-4321');
    expect(isValidBrMobile('(11) 98765-4321')).toBe(true);
    expect(ufFromPhone('11987654321')).toBe('SP');
    expect(phoneDigits('(11) 98765-4321')).toBe('11987654321');
  });

  it('rejeita fixo e DDD inválido', () => {
    expect(isValidBrMobile('1133334444')).toBe(false);
    expect(brMobileError('1133334444')).toMatch(/9 dígitos/i);
    expect(isValidBrMobile('00987654321')).toBe(false);
    expect(brMobileError('')).toMatch(/Informe/);
  });

  it('mapeia DDD regionais', () => {
    expect(ufFromPhone('84999887766')).toBe('RN');
    expect(ufFromPhone('21988776655')).toBe('RJ');
  });

  it('valida CPF com dígitos verificadores', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
    expect(cpfError('529.982.247-25')).toBeNull();
    expect(cpfError('123')).toMatch(/11 dígitos/);
  });

  it('normaliza data de nascimento', () => {
    expect(normalizeBirthDate('15/03/1990')).toBe('15/03/1990');
    expect(normalizeBirthDate('15031990')).toBe('15/03/1990');
    expect(normalizeBirthDate('31/02/1990')).toBeNull();
    expect(normalizeBirthDate('01/01/2015')).toBeNull(); // < 16 anos em 2026
    expect(birthDateError('')).toMatch(/Informe/);
  });
});
