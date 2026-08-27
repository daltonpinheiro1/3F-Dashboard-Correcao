import { describe, expect, it } from 'vitest';
import { matchOperadorKey } from './ofensorOp';

describe('matchOperadorKey', () => {
  it('casa login, id e nome (case-insensitive)', () => {
    const row = { login: 'rosana.p', id_user: 42, user_name: 'ROSANA PERES BATISTA' };
    expect(matchOperadorKey(row, 'rosana.p')).toBe(true);
    expect(matchOperadorKey(row, 'ROSANA.P')).toBe(true);
    expect(matchOperadorKey(row, '42')).toBe(true);
    expect(matchOperadorKey(row, 'rosana peres batista')).toBe(true);
    expect(matchOperadorKey(row, 'outro')).toBe(false);
  });
});
