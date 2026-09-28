import { describe, expect, it } from 'vitest';
import { agregarOperadoresRecorte, filtrosPeriodoRecorte } from './operadoresRecorte';

const periodo = { de: '2026-09-01', ate: '2026-09-30' };

describe('operadoresRecorte', () => {
  it('monta período + eq de supervisor/equipe', () => {
    expect(filtrosPeriodoRecorte('2026-09-01', '2026-09-30', { supervisor: 'Ana', equipe: 'E1' })).toEqual([
      { column: 'data_venda', op: 'gte', value: '2026-09-01T00:00:00.000Z' },
      { column: 'data_venda', op: 'lte', value: '2026-09-30T23:59:59.999Z' },
      { column: 'supervisor', op: 'eq', value: 'Ana' },
      { column: 'equipe', op: 'eq', value: 'E1' },
    ]);
  });

  it('conta só as propostas do vendedor naquela equipe', () => {
    const logs = [
      { proposta_id: 'p1', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', tipos_erro: ['cep'], campos_alterados: ['cep'] },
      { proposta_id: 'p1', vendedor: 'roboadm2', equipe: 'E1', supervisor: 'Ana', tipos_erro: ['bairro'], campos_alterados: ['bairro'] },
      { proposta_id: 'p2', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', tipos_erro: [], campos_alterados: [] },
      { proposta_id: 'p3', vendedor: 'Joao', equipe: 'E2', supervisor: 'Bia', tipos_erro: ['cep'], campos_alterados: ['cep'] },
      { proposta_id: 'p4', vendedor: 'roboadm', equipe: 'E1', supervisor: 'Ana', tipos_erro: ['cep'], campos_alterados: ['cep'] },
    ];
    const sms = [
      { proposta_id: 'p1', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', sms_previo: true, ticket_status: 'Portado' },
      { proposta_id: 'p3', vendedor: 'Joao', equipe: 'E2', supervisor: 'Bia', sms_previo: false },
    ];
    const tbx = [
      { proposta_id: 'p1', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', status: 'entregue' },
      { proposta_id: 'p2', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', status: 'insucesso' },
      { proposta_id: 'p3', vendedor: 'Joao', equipe: 'E2', supervisor: 'Bia', status: 'insucesso' },
    ];
    const ops = agregarOperadoresRecorte(logs, sms, tbx, { supervisor: 'Ana', equipe: 'E1' }, periodo);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      vendedor: 'Joao',
      equipe: 'E1',
      supervisor: 'Ana',
      total_propostas: 2,
      total_corrigidas: 1,
      erros_cep: 1,
      sms_total: 1,
      sms_com: 1,
      sms_suc_com: 1,
      tbx_entregue: 1,
      tbx_insucesso: 1,
    });

    const todos = agregarOperadoresRecorte(logs, sms, tbx, { supervisor: '', equipe: '' }, periodo);
    expect(todos[0]).toMatchObject({ total_propostas: 3, equipe: 'Múltiplas equipes: E1, E2' });
  });

  it('recorte "Sem supervisor" pega supervisor vazio', () => {
    const logs = [
      { proposta_id: 'p1', vendedor: 'Joao', equipe: 'E1', supervisor: null, tipos_erro: [] },
      { proposta_id: 'p2', vendedor: 'Joao', equipe: 'E1', supervisor: 'Ana', tipos_erro: [] },
    ];
    const ops = agregarOperadoresRecorte(logs, [], [], { supervisor: 'Sem supervisor', equipe: '' }, periodo);
    expect(ops[0].total_propostas).toBe(1);
  });
});
