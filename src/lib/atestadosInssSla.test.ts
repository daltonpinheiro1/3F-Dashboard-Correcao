import { describe, expect, it } from 'vitest';
import { calcularInssSla, ordenarInssPorSla } from './atestadosInssSla';
import type { Atestado } from './atestadosEscala';

const base = (over: Partial<Atestado>): Atestado =>
  ({
    id: '1',
    protocolo: 'AT-1',
    colaborador_nome: 'Ana',
    tipo: 'medico',
    unidade_periodo: 'dias',
    status: 'protocolado',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over,
  }) as Atestado;

describe('atestadosInssSla', () => {
  it('calcula SLA para afastamento longo', () => {
    const r = calcularInssSla(
      base({
        data_inicio: '2026-01-01',
        data_fim: '2026-01-20',
        quantidade_dias: 20,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.diasAfastamento).toBeGreaterThan(15);
  });

  it('ordena por urgência', () => {
    const a = base({ id: 'a', data_inicio: '2026-01-01', data_fim: '2026-01-25', quantidade_dias: 25 });
    const b = base({ id: 'b', data_inicio: '2026-08-01', data_fim: '2026-08-25', quantidade_dias: 25 });
    const sorted = ordenarInssPorSla([b, a]);
    expect(sorted[0].id).toBe('a');
  });
});
