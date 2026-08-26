import { describe, expect, it } from 'vitest';
import {
  requerAprovacaoDpFromRow,
  sanitizeAdvertenciaPost,
  validateAdvertenciaPatchTransition,
  validateAdvertenciaPost,
} from './advertenciasValidate';

describe('advertenciasValidate (server)', () => {
  it('apuração idx 10 exige DP mesmo sem dias de suspensão', () => {
    expect(
      requerAprovacaoDpFromRow({
        nivel_idx: 10,
        dias_suspensao: 0,
        nivel_codigo: 'advertencia_ou_apuracao_dp',
      }),
    ).toBe(true);
  });

  it('sanitize força pendente para apuração enviada como aprovada', () => {
    const row = sanitizeAdvertenciaPost({
      nivel_idx: 10,
      nivel_codigo: 'advertencia_ou_apuracao_dp',
      dias_suspensao: 0,
      status: 'aprovada',
      colaborador_nome: 'Teste',
      descricao: 'x',
      motivo_categoria: 'DESIDIA NO DESEMPENHO DAS FUNCOES',
    });
    expect(row.status).toBe('pendente');
    expect(row.entrega_status).toBe('aguardando_aprovacao');
  });

  it('rejeita POST com entrega já concluída', () => {
    const row = sanitizeAdvertenciaPost({
      nivel_idx: 0,
      status: 'aprovada',
      entrega_status: 'entregue',
      colaborador_nome: 'Teste',
      descricao: 'x',
      motivo_categoria: 'DESIDIA NO DESEMPENHO DAS FUNCOES',
    });
    const check = validateAdvertenciaPost(row);
    expect(check.ok).toBe(false);
  });

  it('valida transição impressão → entrega', () => {
    const current = { status: 'aprovada', entrega_status: 'aguardando_impressao' };
    expect(validateAdvertenciaPatchTransition(current, { entrega_status: 'impressa' }).ok).toBe(true);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'aprovada', entrega_status: 'impressa' },
        { entrega_status: 'entregue' },
      ).ok,
    ).toBe(true);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'aprovada', entrega_status: 'aguardando_impressao' },
        { entrega_status: 'entregue' },
      ).ok,
    ).toBe(false);
  });

  it('valida aprovação só de pendente', () => {
    expect(
      validateAdvertenciaPatchTransition({ status: 'pendente' }, { status: 'aprovada' }).ok,
    ).toBe(true);
    expect(
      validateAdvertenciaPatchTransition({ status: 'aprovada' }, { status: 'aprovada' }).ok,
    ).toBe(false);
  });
});
