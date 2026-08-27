import { describe, expect, it } from 'vitest';
import { resolveAuditAction, sanitizeAuditPatch } from './advertenciasAudit';

describe('sanitizeAuditPatch', () => {
  it('remove anexos e trunca strings longas', () => {
    const out = sanitizeAuditPatch({
      status: 'aprovada',
      anexos: [{ x: 1 }],
      pdf_base64: 'AAAA',
      descricao: 'x'.repeat(2500),
    });
    expect(out.status).toBe('aprovada');
    expect(out.anexos).toBeUndefined();
    expect(out.pdf_base64).toBeUndefined();
    expect(String(out.descricao).endsWith('…')).toBe(true);
    expect(String(out.descricao).length).toBe(2001);
  });
});

describe('resolveAuditAction', () => {
  it('mapeia create e transições de status', () => {
    expect(resolveAuditAction(null, undefined, 'create')).toBe('create');
    expect(resolveAuditAction('pendente', { status: 'aprovada' }, 'patch')).toBe('status_aprovada');
    expect(resolveAuditAction('pendente', { status: 'recusada' }, 'patch')).toBe('status_recusada');
    expect(resolveAuditAction('aprovada', { entrega_status: 'entregue' }, 'patch')).toBe('entrega_update');
    expect(resolveAuditAction('aprovada', { observacoes_supervisor: 'ok' }, 'patch')).toBe('patch');
  });
});
