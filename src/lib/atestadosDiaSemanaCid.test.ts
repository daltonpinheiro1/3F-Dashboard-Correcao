import { describe, expect, it } from 'vitest';
import { agregarDiaSemanaCid, cidCapitulo, diaSemanaIdx } from './atestadosDiaSemanaCid';
import type { Atestado } from './atestadosEscala';

function mockRow(partial: Partial<Atestado>): Atestado {
  return {
    id: '1',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    protocolo: 'AT-TEST',
    colaborador_nome: 'Teste',
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 1,
    status: 'aprovado',
    ...partial,
  };
}

describe('atestadosDiaSemanaCid', () => {
  it('diaSemanaIdx mapeia segunda-feira', () => {
    expect(diaSemanaIdx('2026-08-24')).toBe(0); // Seg
    expect(diaSemanaIdx('2026-08-30')).toBe(6); // Dom
  });

  it('cidCapitulo identifica capítulo', () => {
    expect(cidCapitulo('J06.9')).toBe('Respiratório');
    expect(cidCapitulo('M54.5')).toBe('Osteomuscular');
  });

  it('agrega por dia da semana e top CIDs', () => {
    const rows = [
      mockRow({ id: '1', data_inicio: '2026-08-24', cid: 'J06.9' }), // Seg
      mockRow({ id: '2', data_inicio: '2026-08-24', cid: 'J06.9' }),
      mockRow({ id: '3', data_inicio: '2026-08-25', cid: 'M54.5' }), // Ter
      mockRow({ id: '4', data_inicio: '2026-08-25', cid: null }),
    ];
    const agg = agregarDiaSemanaCid(rows);
    expect(agg.totalComData).toBe(4);
    expect(agg.topCids[0]?.cid).toBe('J06.9');
    const seg = agg.chartData.find((r) => r.dia === 'Seg');
    expect(seg?.total).toBe(2);
    expect(seg?.['J06.9']).toBe(2);
    const ter = agg.chartData.find((r) => r.dia === 'Ter');
    expect(ter?.['M54.5']).toBe(1);
    expect(ter?.['Sem CID']).toBe(1);
  });
});
