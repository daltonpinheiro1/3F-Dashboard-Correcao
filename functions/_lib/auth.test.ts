import { describe, expect, it } from 'vitest';
import {
  isDashboardAdmin,
  requireAdmin,
  requireAtestadoWrite,
  requireGestao,
  requireInteligencia,
  requirePortabilidadeRead,
  requireRr,
  sessionCookie,
  sessionCredentials,
  type AuthResult,
} from './auth';

function session(role: string, abas?: string[]): AuthResult {
  return {
    ok: true,
    mode: 'session',
    user: { id: '1', email: `${role}@3f.com`, role, abas },
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

  it('requirePortabilidadeRead libera viewer só com aba disparos', () => {
    expect(requirePortabilidadeRead(session('admin')).ok).toBe(true);
    expect(requirePortabilidadeRead(session('supervisor')).ok).toBe(true);
    expect(requirePortabilidadeRead(session('viewer')).ok).toBe(false);
    expect(requirePortabilidadeRead(session('viewer', ['disparos'])).ok).toBe(true);
  });

  it('requireInteligencia libera viewer só com aba inteligencia', () => {
    expect(requireInteligencia(session('supervisor')).ok).toBe(true);
    expect(requireInteligencia(session('viewer')).ok).toBe(false);
    expect(requireInteligencia(session('viewer', ['inteligencia'])).ok).toBe(true);
  });

  it('requireRr aceita aba rr sem role admin', () => {
    expect(requireRr(session('admin')).ok).toBe(true);
    expect(requireRr(session('viewer')).ok).toBe(false);
    expect(requireRr(session('viewer', ['rr'])).ok).toBe(true);
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

  it('lê credencial do cookie HttpOnly e mantém headers como compatibilidade', () => {
    const cookie = sessionCookie('Admin@3F.test', 'n'.repeat(32));
    const fromCookie = sessionCredentials(
      new Request('https://dash.test', { headers: { cookie } }),
    );
    expect(fromCookie).toEqual({ email: 'admin@3f.test', nonce: 'n'.repeat(32) });

    const fromHeaders = sessionCredentials(
      new Request('https://dash.test', {
        headers: {
          'x-dashboard-email': 'legacy@3f.test',
          'x-dashboard-session': 'x'.repeat(32),
        },
      }),
    );
    expect(fromHeaders.email).toBe('legacy@3f.test');
  });

  it('prioriza cookie e permite desligar headers legados', () => {
    const cookie = sessionCookie('cookie@3f.test', 'c'.repeat(32));
    const request = new Request('https://dash.test', {
      headers: {
        cookie,
        'x-dashboard-email': 'header@3f.test',
        'x-dashboard-session': 'h'.repeat(32),
      },
    });
    expect(sessionCredentials(request)).toEqual({
      email: 'cookie@3f.test',
      nonce: 'c'.repeat(32),
    });
    expect(
      sessionCredentials(
        new Request('https://dash.test', {
          headers: {
            'x-dashboard-email': 'legacy@3f.test',
            'x-dashboard-session': 'x'.repeat(32),
          },
        }),
        false,
      ),
    ).toEqual({ email: '', nonce: '' });
  });
});
