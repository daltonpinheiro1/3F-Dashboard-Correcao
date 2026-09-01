import { describe, expect, it } from 'vitest';
import {
  isDashboardAdmin,
  requireAdmin,
  requireAtestadoWrite,
  requireGestao,
  requireInteligencia,
  requirePortabilidadeRead,
  type AuthResult,
} from './auth';

function session(role: string): AuthResult {
  return {
    ok: true,
    mode: 'session',
    user: { id: '1', email: `${role}@3f.com`, role },
  };
}

const secret: AuthResult = { ok: true, mode: 'secret' };
const denied: AuthResult = { ok: false, status: 401, error: 'nope' };

describe('auth role gates', () => {
  it('requireAdmin aceita admin case-insensitive e secret', () => {
    expect(requireAdmin(session('admin')).ok).toBe(true);
    expect(requireAdmin(session('Admin')).ok).toBe(true);
    expect(requireAdmin(secret).ok).toBe(true);
    expect(requireAdmin(session('supervisor')).ok).toBe(false);
    expect(requireAdmin(denied).ok).toBe(false);
  });

  it('requireGestao libera admin/supervisor/viewer', () => {
    expect(requireGestao(session('admin')).ok).toBe(true);
    expect(requireGestao(session('supervisor')).ok).toBe(true);
    expect(requireGestao(session('viewer')).ok).toBe(true);
    expect(requireGestao(session('user')).ok).toBe(false);
    expect(requireGestao(secret).ok).toBe(true);
  });

  it('requirePortabilidadeRead NÃO libera viewer', () => {
    expect(requirePortabilidadeRead(session('admin')).ok).toBe(true);
    expect(requirePortabilidadeRead(session('supervisor')).ok).toBe(true);
    expect(requirePortabilidadeRead(session('viewer')).ok).toBe(false);
  });

  it('requireInteligencia segue portabilidade read', () => {
    expect(requireInteligencia(session('supervisor')).ok).toBe(true);
    expect(requireInteligencia(session('viewer')).ok).toBe(false);
  });

  it('requireAtestadoWrite segue gestao (inclui viewer)', () => {
    expect(requireAtestadoWrite(session('viewer')).ok).toBe(true);
    expect(requireAtestadoWrite(session('guest')).ok).toBe(false);
  });

  it('isDashboardAdmin', () => {
    expect(isDashboardAdmin(session('admin'))).toBe(true);
    expect(isDashboardAdmin(session('ADMIN'))).toBe(true);
    expect(isDashboardAdmin(secret)).toBe(true);
    expect(isDashboardAdmin(session('viewer'))).toBe(false);
    expect(isDashboardAdmin(denied)).toBe(false);
  });
});
