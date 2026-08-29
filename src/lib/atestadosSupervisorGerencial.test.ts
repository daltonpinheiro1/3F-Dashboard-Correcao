import { describe, expect, it } from 'vitest';
import {
  agregarPorSupervisor,
  buildMapaOperadorSupervisor,
  resumoSupervisorLogado,
  supervisorDoColaborador,
} from './atestadosSupervisorGerencial';
import type { Atestado } from './atestadosEscala';
import type { EvaPayload } from './evaDash';

function mockRow(partial: Partial<Atestado>): Atestado {
  return {
    id: '1',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    protocolo: 'AT-TEST',
    colaborador_nome: 'Maria Souza',
    colaborador_matricula: 'm123',
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 2,
    status: 'protocolado',
    data_inicio: '2026-08-24',
    ...partial,
  };
}

describe('atestadosSupervisorGerencial', () => {
  it('mapeia colaborador ao supervisor via EVA', () => {
    const eva = {
      jornada: [
        {
          id_user: 1,
          user_name: 'Maria Souza',
          login: 'm123',
          supervisor_name: 'Ana Supervisor',
          date_login: '2026-08-28',
          date_logout: null,
          logins: 1,
          logged_time: 3600,
          paused_time: 0,
        },
      ],
    } as unknown as EvaPayload;
    const mapa = buildMapaOperadorSupervisor(eva);
    expect(supervisorDoColaborador(mockRow({}), mapa)).toBe('Ana Supervisor');
  });

  it('prioriza colaborador_supervisor gravado no protocolo', () => {
    const mapa = new Map<string, string>();
    expect(
      supervisorDoColaborador(mockRow({ colaborador_supervisor: 'Sup Protocolo' }), mapa),
    ).toBe('Sup Protocolo');
  });

  it('agrega por supervisor', () => {
    const eva = {
      jornada: [
        {
          id_user: 1,
          user_name: 'Maria Souza',
          login: 'm123',
          supervisor_name: 'Ana Supervisor',
          date_login: '2026-08-28',
          date_logout: null,
          logins: 1,
          logged_time: 3600,
          paused_time: 0,
        },
      ],
    } as unknown as EvaPayload;
    const mapa = buildMapaOperadorSupervisor(eva);
    const rows = [mockRow({ id: '1' }), mockRow({ id: '2', status: 'aprovado' })];
    const agg = agregarPorSupervisor(rows, mapa);
    expect(agg[0]?.supervisor).toBe('Ana Supervisor');
    expect(agg[0]?.total).toBe(2);
    expect(agg[0]?.pendentes).toBe(1);
    expect(agg[0]?.aprovados).toBe(1);
  });

  it('resumo supervisor filtra por e-mail', () => {
    const rows = [
      mockRow({ id: '1', criado_por_email: 'sup@3f.com', origem: 'supervisor' }),
      mockRow({ id: '2', criado_por_email: 'outro@3f.com', origem: 'supervisor' }),
    ];
    const r = resumoSupervisorLogado(rows, 'sup@3f.com', 'Ana');
    expect(r.total).toBe(1);
    expect(r.pendentes).toBe(1);
  });
});
