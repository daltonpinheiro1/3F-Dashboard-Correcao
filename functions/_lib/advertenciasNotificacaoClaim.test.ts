import { describe, expect, it } from 'vitest';
import {
  buildNotificacaoClaimBody,
  buildNotificacaoClaimPath,
  claimNotificacao,
  claimSemMigration,
} from './advertenciasNotificacaoClaim';

const agora = new Date('2026-10-14T18:00:00.000Z');
const base = { id: 'abc', force: false, tentativasAtual: 2, agora };

function resp(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('advertenciasNotificacaoClaim', () => {
  it('PATCH condicional por status exclui enviada/enviando (salvo claim vencido)', () => {
    const q = new URLSearchParams(buildNotificacaoClaimPath('status', base).split('?')[1]);
    expect(q.get('id')).toBe('eq.abc');
    expect(q.get('or')).toBe(
      '(notificacao_status.not.in.(enviada,enviando),and(notificacao_status.eq.enviando,notificacao_claim_em.lt."2026-10-14T17:55:00.000Z"))',
    );
    const qf = new URLSearchParams(buildNotificacaoClaimPath('status', { ...base, force: true }).split('?')[1]);
    expect(qf.get('or')).toContain('notificacao_status.neq.enviando');
    expect(buildNotificacaoClaimBody('status', base)).toMatchObject({
      notificacao_status: 'enviando',
      notificacao_tentativas: 3,
    });
  });

  it('fallback sem migration: compare-and-swap em notificacao_tentativas', () => {
    const q = new URLSearchParams(buildNotificacaoClaimPath('tentativas', base).split('?')[1]);
    expect(q.get('notificacao_tentativas')).toBe('eq.2');
    expect(q.get('notificacao_status')).toBe('neq.enviada');
    expect(buildNotificacaoClaimBody('tentativas', base)).not.toHaveProperty('notificacao_status');
    expect(claimSemMigration(400, '{"code":"42703","message":"column advertencias.notificacao_claim_em does not exist"}')).toBe(true);
    expect(claimSemMigration(400, '{"code":"23514"}')).toBe(true);
    expect(claimSemMigration(500, '42703')).toBe(false);
  });

  it('só um envio vence: representação vazia = já em andamento', async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    const won = await claimNotificacao(async (path, init) => {
      calls.push({ path, init });
      return resp(200, [{ id: 'abc' }]);
    }, base);
    expect(won).toMatchObject({ ok: true, modo: 'status' });
    expect(calls[0].init.method).toBe('PATCH');
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe('return=representation');

    const lost = await claimNotificacao(async () => resp(200, []), base);
    expect(lost).toEqual({ ok: false, motivo: 'em_andamento' });
  });

  it('tolera coluna ausente e cai para o modo tentativas', async () => {
    const paths: string[] = [];
    const r = await claimNotificacao(async (path) => {
      paths.push(path);
      return paths.length === 1 ? resp(400, '{"code":"42703"}') : resp(200, [{ id: 'abc' }]);
    }, base);
    expect(r).toMatchObject({ ok: true, modo: 'tentativas' });
    expect(paths[1]).toContain('notificacao_tentativas=eq.2');
  });

  it('erro de banco não envia', async () => {
    const r = await claimNotificacao(async () => resp(500, 'boom'), base);
    expect(r).toMatchObject({ ok: false, motivo: 'erro' });
  });
});
