import { describe, expect, it } from 'vitest';
import { buildOperadoresCatalog, filtrarOperadores, normBusca } from './operadoresCatalog';
import type { Advertencia } from './advertenciasEscala';
import type { EvaPayload } from './evaDash';

describe('operadoresCatalog', () => {
  it('normaliza busca sem acento', () => {
    expect(normBusca('José da Silva')).toBe('JOSE DA SILVA');
  });

  it('une EVA + histórico e filtra por nome/login', () => {
    const hist = [
      {
        id: '1',
        created_at: '2026-01-01',
        colaborador_nome: 'Maria Souza',
        colaborador_matricula: 'M123',
        colaborador_cpf: '111',
        colaborador_cargo: 'Operadora',
        motivo_categoria: 'x',
        motivo_texto: 'x',
        descricao: 'x',
        data_ocorrido: '2026-01-01',
        nivel_idx: 0,
        nivel_codigo: 'feedback_formal',
        nivel_label: 'Feedback',
        status: 'aprovada',
      },
    ] as Advertencia[];
    const eva = {
      ranking_operadores: [
        { login: 'jsilva', operador: 'José Silva', supervisor: 'Ana', total: 1, cpc: 1, sucesso: 0, recusa: 0 },
      ],
      ofensores_tab: [],
    } as unknown as EvaPayload;

    const cat = buildOperadoresCatalog(eva, hist);
    expect(cat.length).toBeGreaterThanOrEqual(2);
    const hits = filtrarOperadores(cat, 'jose');
    expect(hits[0]?.nome).toMatch(/José Silva/i);
    const byLogin = filtrarOperadores(cat, 'jsilva');
    expect(byLogin[0]?.login).toBe('jsilva');
    const byHist = filtrarOperadores(cat, 'maria');
    expect(byHist[0]?.cpf).toBe('111');
  });
});
