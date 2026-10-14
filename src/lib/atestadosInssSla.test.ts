import { describe, expect, it } from 'vitest';
import {
  agruparAlertasInss,
  calcularInssSla,
  calcularInssSlaAlerta,
  ordenarAlertasInssPorSla,
  ordenarInssPorSla,
} from './atestadosInssSla';
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

  it('isolado: prazo de 5 dias a partir do 16º dia (mesmo resultado da regra anterior)', () => {
    const hoje = new Date(2026, 0, 18);
    const sla = calcularInssSla(base({ data_inicio: '2026-01-01', data_fim: '2026-01-20' }), hoje);
    expect(sla!.slaRestante).toBe(15 + 5 - 17);
    expect(sla!.urgencia).toBe('ok');
  });

  it('acumulado: prazo conta do 16º dia somado entre atestados do mesmo CID-raiz', () => {
    const rows = [
      base({ id: 'a', colaborador_matricula: 'M1', cid: 'M54.5', data_inicio: '2026-01-01', data_fim: '2026-01-10' }),
      base({ id: 'b', colaborador_matricula: 'M1', cid: 'M54', data_inicio: '2026-02-01', data_fim: '2026-02-10' }),
    ];
    expect(calcularInssSla(rows[0])).toBeNull();
    const alertas = agruparAlertasInss(rows);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].dia16).toBe('2026-02-06');
    const sla = calcularInssSlaAlerta(alertas[0], new Date(2026, 1, 10));
    expect(sla!.diasAfastamento).toBe(20);
    expect(sla!.slaRestante).toBe(1);
    expect(sla!.urgencia).toBe('atencao');
    expect(calcularInssSlaAlerta(alertas[0], new Date(2026, 1, 12))!.urgencia).toBe('critico');
    expect(ordenarAlertasInssPorSla(alertas)).toHaveLength(1);
  });
});
