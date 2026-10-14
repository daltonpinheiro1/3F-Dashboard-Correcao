import { describe, expect, it } from 'vitest';
import { ABA_IDS, canAccessAbaFor } from '../../shared/abasCatalog';
import {
  authorizeRequest,
  isDashboardAdmin,
  requireAba,
  requireAdmin,
  requireAlgumaAba,
  requireAtestadoWrite,
  requireGestao,
  requireInteligencia,
  requirePortabilidadeRead,
  requireRr,
  sessionCookie,
  sessionCredentials,
  timingSafeEqualStr,
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

  it('requireAba: admin e secret sempre passam', () => {
    expect(requireAba(session('admin'), 'hora').ok).toBe(true);
    expect(requireAba(session('ADMIN', ['dashboard']), 'administracao').ok).toBe(true);
    expect(requireAba(secret, 'rr').ok).toBe(true);
    expect(requireAba(denied, 'dashboard')).toBe(denied);
  });

  it('requireAba: perfil com abas exige a aba, independente do papel', () => {
    expect(requireAba(session('viewer', ['hora']), 'hora').ok).toBe(true);
    expect(requireAba(session('supervisor', ['dashboard']), 'disparos').ok).toBe(false);
    const negado = requireAba(session('viewer', ['dashboard']), 'rr');
    expect(negado).toEqual({ ok: false, status: 403, error: 'Acesso restrito à aba RR.' });
  });

  it('requireAba: sem abas cai no papel', () => {
    expect(requireAba(session('viewer'), 'dashboard').ok).toBe(true);
    expect(requireAba(session('viewer'), 'disparos').ok).toBe(false);
    expect(requireAba(session('supervisor'), 'inteligencia').ok).toBe(true);
    for (const aba of ['administracao', 'hora', 'rr', 'controle-dp', 'atestados']) {
      expect(requireAba(session('supervisor'), aba).ok).toBe(false);
    }
    expect(requireAba(session('guest'), 'dashboard').ok).toBe(false);
  });

  it('requireAlgumaAba: basta uma das abas; lista vazia ou fora do catálogo nega', () => {
    expect(requireAlgumaAba(session('viewer', ['sms']), ['disparos', 'sms']).ok).toBe(true);
    expect(requireAlgumaAba(session('viewer', ['hora']), ['disparos', 'sms'])).toEqual({
      ok: false,
      status: 403,
      error: 'Acesso restrito às abas: Disparos, SMS Prévio.',
    });
    expect(requireAlgumaAba(session('viewer'), ['atestados', 'atestados-solicitar']).ok).toBe(true);
    expect(requireAlgumaAba(session('supervisor'), ['hora', 'rr']).ok).toBe(false);
    expect(requireAlgumaAba(session('admin', ['dashboard']), ['rr']).ok).toBe(true);
    expect(requireAlgumaAba(secret, []).ok).toBe(true);
    expect(requireAlgumaAba(session('viewer', ['sms']), []).ok).toBe(false);
    expect(requireAlgumaAba(session('viewer', ['inexistente']), ['inexistente']).ok).toBe(false);
    expect(requireAlgumaAba(denied, ['sms'])).toBe(denied);
  });

  it('requireAba nega aba fora do catálogo', () => {
    expect(requireAba(session('viewer', ['inexistente']), 'inexistente').ok).toBe(false);
    expect(requireAba(session('viewer'), 'inexistente').ok).toBe(false);
  });

  it('requireAba segue a mesma regra do SPA para todo o catálogo', () => {
    const casos: Array<[string, string[] | undefined]> = [
      ['admin', undefined],
      ['supervisor', undefined],
      ['viewer', undefined],
      ['viewer', ['dashboard', 'rr']],
      ['supervisor', ['hora']],
    ];
    for (const [role, abas] of casos) {
      for (const aba of ABA_IDS) {
        expect(requireAba(session(role, abas), aba).ok).toBe(canAccessAbaFor({ role, abas }, aba));
      }
    }
  });

  it('timingSafeEqualStr compara conteúdo e tamanho', () => {
    expect(timingSafeEqualStr('Bearer abc', 'Bearer abc')).toBe(true);
    expect(timingSafeEqualStr('Bearer abd', 'Bearer abc')).toBe(false);
    expect(timingSafeEqualStr('Bearer ab', 'Bearer abc')).toBe(false);
    expect(timingSafeEqualStr('Bearer abcd', 'Bearer abc')).toBe(false);
    expect(timingSafeEqualStr('', 'Bearer abc')).toBe(false);
  });

  it('authorizeRequest aceita apenas o Bearer secret exato', async () => {
    const env = { DASHBOARD_INSIGHT_SECRET: 's3cr3t-value' };
    const ok = await authorizeRequest(
      new Request('https://dash.test', { headers: { authorization: 'Bearer s3cr3t-value' } }),
      env,
    );
    expect(ok).toEqual({ ok: true, mode: 'secret' });
    const wrong = await authorizeRequest(
      new Request('https://dash.test', { headers: { authorization: 'Bearer s3cr3t-valuX' } }),
      env,
    );
    expect(wrong.ok).toBe(false);
  });

  it('isDashboardAdmin', () => {
    expect(isDashboardAdmin(session('admin'))).toBe(true);
    expect(isDashboardAdmin(session('ADMIN'))).toBe(true);
    expect(isDashboardAdmin(secret)).toBe(true);
    expect(isDashboardAdmin(session('viewer'))).toBe(false);
    expect(isDashboardAdmin(denied)).toBe(false);
  });

  it('lê credencial só do cookie HttpOnly; headers X-Dashboard-* são ignorados', () => {
    const cookie = sessionCookie('Admin@3F.test', 'n'.repeat(32));
    expect(
      sessionCredentials(new Request('https://dash.test', { headers: { cookie } })),
    ).toEqual({ email: 'admin@3f.test', nonce: 'n'.repeat(32) });

    expect(
      sessionCredentials(
        new Request('https://dash.test', {
          headers: {
            'x-dashboard-email': 'legacy@3f.test',
            'x-dashboard-session': 'x'.repeat(32),
          },
        }),
      ),
    ).toEqual({ email: '', nonce: '' });
  });
});
