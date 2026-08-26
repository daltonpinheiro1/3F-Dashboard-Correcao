import { describe, expect, it } from 'vitest';
import { advertenciasToExcelRows } from './advertenciasExport';
import type { Advertencia } from './advertenciasEscala';

const base: Advertencia = {
  id: 'abc-123',
  created_at: '2026-08-26T10:00:00Z',
  colaborador_nome: 'Maria Silva',
  colaborador_matricula: '1001',
  motivo_categoria: 'DESIDIA NO DESEMPENHO DAS FUNCOES',
  motivo_texto: 'Atrasos Recorrentes Na Entrada',
  descricao: 'Texto do ocorrido.',
  data_ocorrido: '2026-08-20',
  nivel_idx: 5,
  nivel_codigo: 'suspensao_2',
  nivel_label: 'Suspensão de 2 dias',
  dias_suspensao: 2,
  status: 'pendente',
  criado_por_nome: 'Caroline',
  criado_por_email: 'carol@test.com',
};

describe('advertenciasExport', () => {
  it('mapeia colunas principais para Excel', () => {
    const [row] = advertenciasToExcelRows([base]);
    expect(row[1]).toBe('Maria Silva');
    expect(row[7]).toBe('DESIDIA NO DESEMPENHO DAS FUNCOES');
    expect(row[11]).toBe('Pendente');
    expect(row[row.length - 1]).toBe('abc-123');
  });
});
