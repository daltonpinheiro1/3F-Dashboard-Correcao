import { describe, expect, it } from 'vitest';
import { agregarSmsDia, listaErroDia, listaGrossDia } from './rrKpis';

describe('rrKpis lista', () => {
  it('Gross cap 80', () => {
    const rows = Array.from({ length: 85 }, (_, i) => ({ proposta_id: `p${i}` }));
    expect(listaGrossDia(rows)).toHaveLength(80);
  });

  it('erro só operacional', () => {
    expect(listaErroDia([{ tipos_erro: ['cep'], proposta_id: 'a' }])).toHaveLength(1);
    expect(listaErroDia([{ tipos_erro: ['referencia_tratamento'], proposta_id: 'a' }])).toHaveLength(0);
  });

  it('Portado TIM conta no consolidado', () => {
    const r = agregarSmsDia([
      { proposta_id: '1', classificacao: 'aguardando', ticket_status: 'Portado TIM' },
    ]);
    expect(r.portadosConsolidado).toBe(1);
  });

  it('Concluído sem ticket conta no consolidado', () => {
    const r = agregarSmsDia([
      {
        proposta_id: '1',
        classificacao: 'aguardando',
        ticket_status: null,
        order_status: 'Concluído',
      },
    ]);
    expect(r.portadosConsolidado).toBe(1);
  });
});
