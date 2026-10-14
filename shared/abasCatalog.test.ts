import { describe, expect, it } from 'vitest';
import { ABA_IDS, canAccessAbaFor, isAbaId } from './abasCatalog';

describe('abasCatalog compartilhado', () => {
  it('isAbaId aceita só ids do catálogo', () => {
    expect(isAbaId('dashboard')).toBe(true);
    expect(isAbaId('mailing')).toBe(true);
    expect(isAbaId('Dashboard')).toBe(false);
    expect(isAbaId('')).toBe(false);
    expect(isAbaId(1)).toBe(false);
  });

  it('ids são únicos', () => {
    expect(new Set(ABA_IDS).size).toBe(ABA_IDS.length);
  });

  it('admin sempre passa, mesmo com perfil restrito', () => {
    expect(canAccessAbaFor({ role: 'admin', abas: ['dashboard'] }, 'administracao')).toBe(true);
  });

  it('perfil com abas vence o papel', () => {
    expect(canAccessAbaFor({ role: 'viewer', abas: ['hora'] }, 'hora')).toBe(true);
    expect(canAccessAbaFor({ role: 'supervisor', abas: ['hora'] }, 'dashboard')).toBe(false);
  });

  it('sem abas usa o papel', () => {
    expect(canAccessAbaFor({ role: 'supervisor' }, 'disparos')).toBe(true);
    expect(canAccessAbaFor({ role: 'viewer', abas: [] }, 'disparos')).toBe(false);
    expect(canAccessAbaFor({ role: 'viewer', abas: null }, 'sms')).toBe(true);
    expect(canAccessAbaFor({ role: 'supervisor' }, 'atestados')).toBe(false);
    expect(canAccessAbaFor({ role: '' }, 'dashboard')).toBe(false);
  });
});
