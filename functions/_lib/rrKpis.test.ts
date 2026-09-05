import { describe, expect, it } from 'vitest';
import {
  agregarSmsDia,
  isPortadoComBilhete,
  isPortadoConsolidado,
  listaErroDia,
  listaGrossDia,
  sinceBrtDaysIso,
  startOfBrtDayIso,
} from './rrKpis';

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

  it('Concluído sem ticket conta no consolidado mas NÃO é Portados hoje (só bilhete)', () => {
    const row = {
      proposta_id: '1',
      classificacao: 'aguardando',
      ticket_status: null,
      order_status: 'Concluído',
    };
    expect(isPortadoConsolidado(row)).toBe(true);
    expect(isPortadoComBilhete(row)).toBe(false);
    const r = agregarSmsDia([row]);
    expect(r.portadosConsolidado).toBe(1);
  });

  it('janela de N dias começa no calendário BRT', () => {
    const agora = new Date('2026-09-01T02:30:00.000Z'); // 23:30 BRT de 31/08
    expect(startOfBrtDayIso(agora)).toBe('2026-08-31T03:00:00.000Z');
    expect(sinceBrtDaysIso(1, agora)).toBe('2026-08-31T03:00:00.000Z');
    expect(sinceBrtDaysIso(2, agora)).toBe('2026-08-30T03:00:00.000Z');
  });
});
