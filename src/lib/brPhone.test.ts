/** Cobertura via shared/brIdentity.test.ts — reexport smoke. */
import { describe, expect, it } from 'vitest';
import { formatBrMobile, isValidCpf, ufFromPhone } from './brPhone';

describe('brPhone reexport', () => {
  it('delega para shared', () => {
    expect(formatBrMobile('11987654321')).toBe('(11) 98765-4321');
    expect(ufFromPhone('84999887766')).toBe('RN');
    expect(isValidCpf('52998224725')).toBe(true);
  });
});
