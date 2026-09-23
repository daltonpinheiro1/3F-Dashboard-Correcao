import { describe, expect, it } from 'vitest';
import {
  requerAprovacaoDpFromRow,
  sanitizeAdvertenciaPost,
  sanitizeAdvertenciaPatch,
  validateAdvertenciaPatchTransition,
  validateAdvertenciaPost,
  applySessionActorsToPatch,
  applyNivelDecisionSnapshot,
  resolvePatchLock,
  avaliarProgressaoAdvertencia,
  niveisAplicadosRows,
} from './advertenciasValidate';

describe('progressão no servidor', () => {
  it('a primeira verbal ou escrita passa sem histórico e a suspensão não', () => {
    expect(avaliarProgressaoAdvertencia(1, [], false, '').ok).toBe(true);
    expect(avaliarProgressaoAdvertencia(2, [], false, '').ok).toBe(true);
    const suspensao = avaliarProgressaoAdvertencia(3, [], false, '');
    expect(suspensao.ok).toBe(false);
    expect(avaliarProgressaoAdvertencia(3, [2], false, '').ok).toBe(true);
  });

  it('histórico só conta medida aprovada ou executada da mesma pessoa', () => {
    const rows = [
      { colaborador_nome: 'Ana', status: 'pendente', nivel_idx: 2 },
      { colaborador_nome: 'Ana', status: 'recusada', nivel_idx: 2 },
      { colaborador_nome: 'Bia', status: 'aprovada', nivel_idx: 2 },
      { colaborador_nome: 'Ana', colaborador_matricula: '10', status: 'aprovada', nivel_idx: 2 },
    ];
    expect(niveisAplicadosRows(rows, 'Ana', '')).toEqual([2]);
    expect(niveisAplicadosRows(rows, 'Outra', '10')).toEqual([2]);
  });
});

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

  it('aprovação DP exige checklist confirmado', () => {
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'pendente', nivel_idx: 5, nivel_codigo: 'suspensao_2', dias_suspensao: 2 },
        { status: 'aprovada' },
      ).ok,
    ).toBe(false);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'pendente', nivel_idx: 5, nivel_codigo: 'suspensao_2', dias_suspensao: 2 },
        { status: 'aprovada' },
        { dpChecklistConfirmado: true },
      ).ok,
    ).toBe(true);
  });

  it('permite reformular nível só ao aprovar/recusar pendente', () => {
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'pendente' },
        { status: 'recusada', recusa_motivo: 'dias insuficientes', nivel_idx: 7 },
      ).ok,
    ).toBe(true);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'pendente' },
        { status: 'aprovada', nivel_idx: 2 },
        { dpChecklistConfirmado: true },
      ).ok,
    ).toBe(true);
    expect(
      validateAdvertenciaPatchTransition({ status: 'pendente' }, { nivel_idx: 5 }).ok,
    ).toBe(false);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'aprovada' },
        { status: 'aprovada', nivel_idx: 7 },
      ).ok,
    ).toBe(false);
  });

  it('sanitize sincroniza codigo/label/dias a partir de nivel_idx', () => {
    const clean = sanitizeAdvertenciaPatch({
      status: 'recusada',
      recusa_motivo: 'x',
      nivel_idx: 5,
      nivel_codigo: 'spoof',
      dias_suspensao: 99,
    });
    expect(clean.nivel_idx).toBe(5);
    expect(clean.nivel_codigo).toBe('suspensao_2');
    expect(clean.dias_suspensao).toBe(2);
  });

  it('sanitize não persiste flag de checklist DP', () => {
    const clean = sanitizeAdvertenciaPatch({
      status: 'aprovada',
      dp_checklist_confirmado: true,
    });
    expect(clean.dp_checklist_confirmado).toBeUndefined();
    expect(clean.status).toBe('aprovada');
  });

  it('sanitize remove snapshot solicitado do client (anti-spoof)', () => {
    const clean = sanitizeAdvertenciaPatch({
      status: 'aprovada',
      nivel_idx: 2,
      nivel_solicitado_idx: 9,
      nivel_solicitado_label: 'spoof',
    });
    expect(clean.nivel_solicitado_idx).toBeUndefined();
    expect(clean.nivel_solicitado_label).toBeUndefined();
  });

  it('applyNivelDecisionSnapshot grava original quando DP reformula', () => {
    const patch: Record<string, unknown> = { status: 'aprovada', nivel_idx: 2 };
    applyNivelDecisionSnapshot(
      { status: 'pendente', nivel_idx: 7, nivel_codigo: 'suspensao_3', nivel_label: 'Suspensão de 3 dias' },
      patch,
    );
    expect(patch.nivel_solicitado_idx).toBe(7);
    expect(patch.nivel_solicitado_codigo).toBe('suspensao_3');
    expect(patch.dias_suspensao_solicitados).toBe(3);
  });

  it('sanitize remove atores spoofáveis do patch', () => {
    const clean = sanitizeAdvertenciaPatch({
      status: 'aprovada',
      aprovado_por_email: 'spoof@evil.com',
      impressa_por_email: 'spoof@evil.com',
      entregue_por_email: 'spoof@evil.com',
    });
    expect(clean.aprovado_por_email).toBeUndefined();
    expect(clean.impressa_por_email).toBeUndefined();
    expect(clean.entregue_por_email).toBeUndefined();
    expect(clean.status).toBe('aprovada');

    applySessionActorsToPatch(clean, { email: 'dp@3f.com', full_name: 'DP' });
    expect(clean.aprovado_por_email).toBe('dp@3f.com');

    const lock = resolvePatchLock(
      { status: 'aprovada', entrega_status: 'aguardando_impressao' },
      { entrega_status: 'impressa' },
    );
    expect(lock.ifEntregaStatus).toBe('aguardando_impressao');
  });

  it('bloqueia salto de status e regressão de entrega', () => {
    expect(
      validateAdvertenciaPatchTransition({ status: 'aprovada' }, { status: 'pendente' }).ok,
    ).toBe(false);
    expect(
      validateAdvertenciaPatchTransition(
        { status: 'aprovada', entrega_status: 'entregue' },
        { entrega_status: 'impressa' },
      ).ok,
    ).toBe(false);
  });
});
