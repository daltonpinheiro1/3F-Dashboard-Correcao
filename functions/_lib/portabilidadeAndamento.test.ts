import { describe, expect, it } from 'vitest';
import {
  acaoMatrixTim,
  andamentoToutbox,
  classificarFatia,
  isEsim,
  motivoPorAndamento,
  rotuloIccidPorAndamento,
} from './portabilidadeAndamento';

const CHIP = '89550287000021350683';

describe('andamento Toutbox', () => {
  it('em rota não é erro — ICCID ainda não existe', () => {
    const and = andamentoToutbox(
      { status: 'monitorando', toutbox_classificacao: 'em_transito' },
      false,
    );
    expect(and).toBe('em rota · aguardando');
    expect(rotuloIccidPorAndamento(false, and)).toBe('— · aguarda entrega');
    expect(
      classificarFatia({
        ag: { status: 'monitorando', toutbox_classificacao: 'em_transito' },
        filas: [{ acao: 'activate', status: 'bko' }],
      }),
    ).toBe('em_transito');
  });

  it('entregue sem ICCID consulta chip na Toutbox', () => {
    const and = andamentoToutbox(
      { status: 'monitorando', toutbox_classificacao: 'entregue' },
      false,
    );
    expect(and).toBe('entregue · consultar ICCID Toutbox');
    expect(rotuloIccidPorAndamento(false, and)).toBe('consultar ICCID Toutbox');
    expect(
      classificarFatia({
        ag: { status: 'monitorando', toutbox_classificacao: 'entregue' },
        filas: [{ acao: 'activate', status: 'bko' }],
      }),
    ).toBe('entregue_aguardando_chip');
  });

  it('entregue com ICCID', () => {
    expect(
      classificarFatia({
        ce: { iccid: CHIP },
        ag: { status: 'monitorando', toutbox_classificacao: 'entregue', iccid: CHIP },
        filas: [],
      }),
    ).toBe('entregue_com_chip');
    expect(rotuloIccidPorAndamento(true, 'entregue · com ICCID')).toBe('sim');
  });

  it('cancelada Toutbox = quebra final', () => {
    const and = andamentoToutbox(
      { status: 'quebra_logistica', toutbox_classificacao: 'cancelada' },
      false,
    );
    expect(and).toBe('quebra · cancelada (chip não chegou)');
    expect(rotuloIccidPorAndamento(false, and)).toBe('não · quebra (chip não chegou)');
    expect(
      classificarFatia({
        ag: { status: 'quebra_logistica', toutbox_classificacao: 'cancelada' },
        filas: [{ acao: 'activate', status: 'bko' }],
      }),
    ).toBe('quebra_logistica');
  });

  it('BKO só quando não há logística em curso (chip físico)', () => {
    expect(
      classificarFatia({
        filas: [{ acao: 'activate', status: 'bko' }],
      }),
    ).toBe('bko');
  });

  it('eSIM sem logística não fica BKO — entra na matrix', () => {
    expect(
      classificarFatia({
        ce: {
          plano: 'TIM CONTROLE e-SIM - DESC 49 - 32,99',
          order_number: '1-186',
          order_status: 'Erro no Aprovisionamento',
          ticket_status: 'Portabilidade Pendente',
          iccid: CHIP,
        },
        filas: [{ acao: 'activate', status: 'bko' }],
      }),
    ).toBe('entregue_com_chip');
    expect(
      classificarFatia({
        ce: {
          plano: 'TIM CONTROLE e-SIM',
          order_number: '1-186',
          order_status: 'Em Aprovisionamento',
          iccid: CHIP,
        },
        filas: [{ acao: 'consult', status: 'bko' }],
      }),
    ).toBe('order_em_aprov');
    expect(
      classificarFatia({
        ce: {
          tipo_chip: 'eSIM',
          order_number: '1-186',
          ticket_status: 'Conflito',
        },
        filas: [{ acao: 'consult', status: 'bko' }],
      }),
    ).toBe('ticket_conflito');
  });

  it('motivo em trânsito é o andamento, não a mensagem BKO', () => {
    expect(
      motivoPorAndamento({
        fatia: 'em_transito',
        andamento: 'em rota · aguardando',
        motivoFila: 'BKO: sem ICCID após esperas (Toutbox/chip)',
      }),
    ).toBe('em rota · aguardando');
  });

  it('detecta eSIM e matrix TIM', () => {
    expect(isEsim({ plano: 'controle e-sim 32,99' })).toBe(true);
    expect(isEsim({ plano: 'TIM CONTROLE A PLUS' })).toBe(false);
    expect(
      acaoMatrixTim({
        order_number: '1-1',
        order_status: 'Em Aprovisionamento',
        iccid: CHIP,
      }),
    ).toBe('consult');
    expect(
      acaoMatrixTim({
        order_number: '1-1',
        order_status: 'Erro no Aprovisionamento',
        iccid: CHIP,
      }),
    ).toBe('activate');
    expect(
      acaoMatrixTim({
        order_number: '1-1',
        ticket_status: '',
      }),
    ).toBe('consult');
    expect(
      acaoMatrixTim({
        order_number: '1-1',
        ticket_status: 'Conflito',
      }),
    ).toBe('reschedule');
  });
});
