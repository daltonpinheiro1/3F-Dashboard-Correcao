import { describe, expect, it } from 'vitest';
import {
  formatarResumoLote,
  montarLoteInteligente,
  sugerirAcaoFatia,
} from './portabilidadeAcaoFatia';

describe('sugerirAcaoFatia', () => {
  it('consult para pré-OS', () => {
    expect(sugerirAcaoFatia({ proposta: '3F-1', fatia: 'pre_os' })).toBe('consult');
  });

  it('OS sem ticket sugere consult', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-2',
        fatia: 'aguardando_ticket',
        order_number: '1-123',
        ticket_status: '',
      }),
    ).toBe('consult');
  });

  it('Erro Aprov + ICCID sugere activate; Em Aprov sugere consult', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-7',
        fatia: 'order_erro_aprov',
        order_number: '1-9',
        order_status: 'Erro no Aprovisionamento',
        tem_iccid: true,
      }),
    ).toBe('activate');
    expect(
      sugerirAcaoFatia({
        proposta: '3F-8',
        fatia: 'order_em_aprov',
        order_number: '1-9',
        order_status: 'Em Aprovisionamento',
        tem_iccid: true,
      }),
    ).toBe('consult');
  });

  it('activate com ICCID', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-3',
        fatia: 'entregue_com_chip',
        order_number: '1-123',
        ticket_status: 'Portabilidade Pendente',
        tem_iccid: true,
      }),
    ).toBe('activate');
  });

  it('eSIM em conflito sugere reschedule (matrix, sem Toutbox)', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-5',
        fatia: 'bko',
        esim: true,
        order_number: '1-9',
        ticket_status: 'Conflito',
      }),
    ).toBe('reschedule');
  });

  it('eSIM Em Aprov + ICCID sugere consult; Erro Aprov + ICCID activate', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-6',
        fatia: 'bko',
        esim: true,
        tem_iccid: true,
        order_number: '1-9',
        order_status: 'Em Aprovisionamento',
        ticket_status: 'Portabilidade Pendente',
      }),
    ).toBe('consult');
    expect(
      sugerirAcaoFatia({
        proposta: '3F-9',
        fatia: 'bko',
        esim: true,
        tem_iccid: true,
        order_number: '1-9',
        order_status: 'Erro no Aprovisionamento',
      }),
    ).toBe('activate');
  });

  it('null para terminal portado', () => {
    expect(sugerirAcaoFatia({ proposta: '3F-4', fatia: 'sucesso_portado' })).toBeNull();
  });
});

describe('montarLoteInteligente', () => {
  it('agrupa ações e respeita máximo', () => {
    const lote = montarLoteInteligente(
      [
        { proposta: '3F-1', fatia: 'bko' },
        { proposta: '3F-2', fatia: 'aguardando_ticket', order_number: '1-1', ticket_status: '' },
        { proposta: '3F-3', fatia: 'sucesso_portado' },
      ],
      'bko',
      25,
      { allowDestructive: true },
    );
    expect(lote).toHaveLength(2);
    expect(formatarResumoLote(lote)).toMatch(/consult/);
    expect(formatarResumoLote(lote)).not.toMatch(/open/);
  });
});
