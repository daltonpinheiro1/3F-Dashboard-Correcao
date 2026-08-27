import { describe, expect, it } from 'vitest';
import {
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  isBeforeCursor,
  paginateRows,
} from './advertenciasList';

describe('advertenciasList (cursor)', () => {
  it('encode/decode roundtrip', () => {
    const c = { created_at: '2026-08-27T10:00:00.000Z', id: 'abc-123' };
    expect(decodeListCursor(encodeListCursor(c))).toEqual(c);
    expect(decodeListCursor('%%%')).toBeNull();
  });

  it('clampListLimit respeita teto', () => {
    expect(clampListLimit(null)).toBe(200);
    expect(clampListLimit('50')).toBe(50);
    expect(clampListLimit('9999')).toBe(500);
    expect(clampListLimit('-1')).toBe(200);
  });

  it('paginateRows keyset DESC', () => {
    const rows = [
      { id: 'c', created_at: '2026-03-01T00:00:00Z' },
      { id: 'b', created_at: '2026-02-01T00:00:00Z' },
      { id: 'a', created_at: '2026-01-01T00:00:00Z' },
    ];
    const p1 = paginateRows(rows, null, 2);
    expect(p1.rows.map((r) => r.id)).toEqual(['c', 'b']);
    expect(p1.has_more).toBe(true);
    expect(p1.next_cursor).toBeTruthy();

    const cur = decodeListCursor(p1.next_cursor);
    expect(cur).toEqual({ created_at: '2026-02-01T00:00:00Z', id: 'b' });
    const p2 = paginateRows(rows, cur, 2);
    expect(p2.rows.map((r) => r.id)).toEqual(['a']);
    expect(p2.has_more).toBe(false);
    expect(p2.next_cursor).toBeNull();
  });

  it('isBeforeCursor', () => {
    const cur = { created_at: '2026-02-01T00:00:00Z', id: 'b' };
    expect(isBeforeCursor({ created_at: '2026-01-01T00:00:00Z', id: 'a' }, cur)).toBe(true);
    expect(isBeforeCursor({ created_at: '2026-03-01T00:00:00Z', id: 'c' }, cur)).toBe(false);
    expect(isBeforeCursor({ created_at: '2026-02-01T00:00:00Z', id: 'a' }, cur)).toBe(true);
  });
});
