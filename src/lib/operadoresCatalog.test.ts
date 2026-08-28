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

  it('inclui colaborador só no acervo de atestados e busca por token parcial', () => {
    const atestados = [
      {
        colaborador_nome: 'RHIAN TEIXEIRA SILVA CARDOSO',
        colaborador_matricula: '998877',
      },
    ];
    const cat = buildOperadoresCatalog(null, [], atestados);
    expect(cat.some((o) => o.nome === 'RHIAN TEIXEIRA SILVA CARDOSO')).toBe(true);

    const byFirst = filtrarOperadores(cat, 'RHIAN');
    expect(byFirst[0]?.nome).toBe('RHIAN TEIXEIRA SILVA CARDOSO');

    const byLast = filtrarOperadores(cat, 'CARDOSO');
    expect(byLast[0]?.nome).toBe('RHIAN TEIXEIRA SILVA CARDOSO');

    const byMiddle = filtrarOperadores(cat, 'TEIXEIRA SILVA');
    expect(byMiddle[0]?.nome).toBe('RHIAN TEIXEIRA SILVA CARDOSO');
  });

  it('inclui operadores da jornada EVA mesmo fora do ranking', () => {
    const eva = {
      ranking_operadores: [],
      ofensores_tab: [],
      jornada: [
        {
          id_user: 1,
          user_name: 'RHIAN TEIXEIRA SILVA CARDOSO',
          login: 'rhian.tc',
          supervisor_name: 'Supervisor A',
          campaign_name: 'Camp',
          date_login: '2026-08-28',
          date_logout: null,
          logins: 1,
          logged_time: 3600,
          paused_time: 0,
        },
      ],
    } as unknown as EvaPayload;

    const cat = buildOperadoresCatalog(eva, []);
    const hits = filtrarOperadores(cat, 'rhian');
    expect(hits[0]?.nome).toBe('RHIAN TEIXEIRA SILVA CARDOSO');
    expect(hits[0]?.login).toBe('rhian.tc');
  });
});
