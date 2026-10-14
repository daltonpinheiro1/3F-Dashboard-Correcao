import { describe, expect, it } from 'vitest';
import {
  applySessionActorsToAtestadoPatch,
  deveNotificarDecisaoAtestado,
  sanitizeAtestadoPatch,
  sanitizeAtestadoPost,
  validateAtestadoPatchTransition,
  validateAtestadoPost,
} from './atestadosValidate';

describe('atestadosValidate', () => {
  it('rejeita post sem colaborador', () => {
    const row = sanitizeAtestadoPost({ quantidade_dias: 2 });
    expect(validateAtestadoPost(row).ok).toBe(false);
  });

  it('aceita post com dias', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      quantidade_dias: 3,
      unidade_periodo: 'dias',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
  });

  it('completa data_fim a partir de início + dias', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      data_inicio: '2026-08-28',
      quantidade_dias: 3,
      unidade_periodo: 'dias',
    });
    expect(row.data_fim).toBe('2026-08-30');
  });

  it('aceita post com horas', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      quantidade_horas: 4,
      unidade_periodo: 'horas',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
  });

  it('rejeita post com data_fim anterior a data_inicio', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      data_inicio: '2026-08-28',
      data_fim: '2026-08-20',
      quantidade_dias: 3,
      unidade_periodo: 'dias',
    });
    expect(validateAtestadoPost(row).ok).toBe(false);
  });

  it('aceita período de um dia (início = fim)', () => {
    const row = sanitizeAtestadoPost({
      colaborador_nome: 'Ana Costa',
      data_inicio: '2026-08-28',
      data_fim: '2026-08-28',
      unidade_periodo: 'dias',
    });
    expect(validateAtestadoPost(row)).toEqual({ ok: true });
    expect(row.quantidade_dias).toBe(1);
  });

  it('patch que move data_inicio para depois do data_fim gravado é rejeitado', () => {
    const current = { status: 'protocolado', data_inicio: '2026-08-01', data_fim: '2026-08-03' };
    const patch = sanitizeAtestadoPatch({ data_inicio: '2026-08-10' });
    expect(validateAtestadoPatchTransition(current, patch).ok).toBe(false);
  });

  it('patch sem datas não é bloqueado por período legado invertido', () => {
    const current = { status: 'protocolado', data_inicio: '2026-08-10', data_fim: '2026-08-03' };
    const patch = sanitizeAtestadoPatch({ observacoes: 'ok' });
    expect(validateAtestadoPatchTransition(current, patch)).toEqual({ ok: true });
  });

  it('e-mail de decisão só na transição para aprovado/recusado', () => {
    expect(deveNotificarDecisaoAtestado('em_analise', 'aprovado')).toBe(true);
    expect(deveNotificarDecisaoAtestado('protocolado', 'recusado')).toBe(true);
    expect(deveNotificarDecisaoAtestado('aprovado', 'aprovado')).toBe(false);
    expect(deveNotificarDecisaoAtestado('recusado', 'recusado')).toBe(false);
    expect(deveNotificarDecisaoAtestado('aprovado', 'arquivado')).toBe(false);
  });

  it('PATCH ignora analisado_por_*/analisado_em do cliente; servidor carimba a decisão', () => {
    const patch = sanitizeAtestadoPatch({
      status: 'aprovado',
      analisado_por_email: 'forjado@x.com',
      analisado_por_nome: 'Forjado',
      analisado_em: '2020-01-01T00:00:00Z',
    });
    expect(patch).toEqual({ status: 'aprovado' });
    expect(validateAtestadoPatchTransition({ status: 'protocolado' }, patch).ok).toBe(false);
    applySessionActorsToAtestadoPatch(patch, { email: 'dp@3f.com', full_name: 'DP' });
    expect(patch.analisado_por_email).toBe('dp@3f.com');
    expect(String(patch.analisado_em)).not.toBe('2020-01-01T00:00:00Z');
    expect(validateAtestadoPatchTransition({ status: 'protocolado' }, patch)).toEqual({ ok: true });

    const viaSecret = sanitizeAtestadoPatch({ status: 'aprovado' });
    applySessionActorsToAtestadoPatch(viaSecret, null);
    expect(viaSecret.analisado_por_email).toBeUndefined();
    expect(viaSecret.analisado_em).toBeTruthy();
  });
});
