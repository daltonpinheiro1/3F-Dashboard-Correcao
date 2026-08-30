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

  it('open quando OS sem ticket', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-2',
        fatia: 'aguardando_ticket',
        order_number: '1-123',
        ticket_status: '',
      }),
    ).toBe('open');
  });

  it('activate com ICCID', () => {
    expect(
      sugerirAcaoFatia({
        proposta: '3F-3',
        fatia: 'entregue_com_chip',
        order_number: '1-123',
        tem_iccid: true,
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
    );
    expect(lote).toHaveLength(2);
    expect(formatarResumoLote(lote)).toMatch(/consult/);
    expect(formatarResumoLote(lote)).toMatch(/open/);
  });
});
