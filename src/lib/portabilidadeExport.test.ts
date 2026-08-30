import { describe, expect, it } from 'vitest';
import { portabilidadeFatiaToExcelRows } from './portabilidadeExport';

describe('portabilidadeFatiaToExcelRows', () => {
  it('mapeia colunas na ordem esperada', () => {
    const [row] = portabilidadeFatiaToExcelRows([
      {
        proposta: '3F-260044055',
        order_number: '1-1860083418180',
        order_status: 'Pendente Portabilidade',
        ticket_status: 'Conflito',
        ticket_number: 'TK-1',
        tem_iccid: true,
        logistica: 'monitorando/em_transito',
        fila: 'consult:pendente',
        motivo_recusar: 'Motivo TIM',
        cancelamento: null,
        updated_at: '2026-08-15T12:00:00.000Z',
      },
    ]);
    expect(row[0]).toBe('3F-260044055');
    expect(row[1]).toBe('1-1860083418180');
    expect(row[5]).toBe('Motivo TIM');
    expect(row[7]).toBe('sim');
    expect(row[10]).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('trata campos vazios', () => {
    const [row] = portabilidadeFatiaToExcelRows([
      {
        proposta: '3F-1',
        tem_iccid: false,
      },
    ]);
    expect(row[2]).toBe('');
    expect(row[7]).toBe('não');
    expect(row[10]).toBe('');
  });
});
