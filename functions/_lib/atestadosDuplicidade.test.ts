import { describe, expect, it } from 'vitest';
import {
  diasEfetivos,
  findSobreposicoes,
  periodosSobrepoem,
  requerAlertaInss,
} from './atestadosDuplicidade';

describe('atestadosDuplicidade', () => {
  it('detecta sobreposição de períodos', () => {
    const a = { data_inicio: '2026-03-01', data_fim: '2026-03-05' };
    const b = { data_inicio: '2026-03-04', data_fim: '2026-03-08' };
    expect(periodosSobrepoem(a, b)).toBe(true);
    expect(periodosSobrepoem(a, { data_inicio: '2026-03-10', data_fim: '2026-03-12' })).toBe(false);
  });

  it('findSobreposicoes ignora recusados', () => {
    const hits = findSobreposicoes(
      [
        {
          id: '1',
          protocolo: 'AT-1',
          colaborador_nome: 'Ana',
          data_inicio: '2026-03-01',
          data_fim: '2026-03-03',
          status: 'recusado',
        },
        {
          id: '2',
          protocolo: 'AT-2',
          colaborador_nome: 'Ana',
          data_inicio: '2026-03-02',
          data_fim: '2026-03-04',
          status: 'aprovado',
        },
      ],
      {
        id: '3',
        colaborador_nome: 'Ana',
        data_inicio: '2026-03-03',
        data_fim: '2026-03-05',
        status: 'protocolado',
      },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].protocolo).toBe('AT-2');
  });

  it('INSS alerta acima de 15 dias', () => {
    expect(requerAlertaInss({ data_inicio: '2026-01-01', data_fim: '2026-01-20' })).toBe(true);
    expect(diasEfetivos({ data_inicio: '2026-01-01', data_fim: '2026-01-10' })).toBe(10);
  });
});
