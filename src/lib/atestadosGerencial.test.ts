import { describe, expect, it } from 'vitest';
import { agregarGerencialAno } from './atestadosGerencial';
import type { Atestado } from './atestadosEscala';

function mockRow(partial: Partial<Atestado>): Atestado {
  return {
    id: '1',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    protocolo: 'AT-2026-TEST01',
    colaborador_nome: 'Teste',
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 2,
    status: 'aprovado',
    ...partial,
  };
}

describe('atestadosGerencial', () => {
  it('agrega totais por ano e tipo', () => {
    const rows = [
      mockRow({ data_inicio: '2026-02-01', quantidade_dias: 2, tipo: 'medico' }),
      mockRow({
        id: '2',
        data_inicio: '2026-03-01',
        quantidade_horas: 4,
        unidade_periodo: 'horas',
        tipo: 'odontologico',
      }),
      mockRow({ id: '3', data_inicio: '2025-12-01' }),
    ];
    const g = agregarGerencialAno(rows, 2026);
    expect(g.total).toBe(2);
    expect(g.total_dias).toBe(2);
    expect(g.total_horas).toBe(4);
    expect(g.por_tipo.medico.count).toBe(1);
    expect(g.por_tipo.odontologico.horas).toBe(4);
  });
});
