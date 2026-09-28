import { describe, expect, it } from 'vitest';
import { agregarEvaPeriodo, janelaEixoRadar, periodoIncluiHoje } from './intelPeriodo';
import type { EvaPayload } from './evaDash';

function dia(data: string, rk: { total: number; cpc: number }, dial: { tab: number; cpcRate: number }): EvaPayload {
  return {
    updated_at: `${data}T20:00:00.000Z`,
    data,
    kpis_operacao: {},
    kpis_chamadas: {},
    jornada: [{ login: 'a' }],
    pausas_por_tipo: [],
    chamadas_recente: [],
    top_tabulacao: [],
    por_campanha: [],
    serie_hora: [],
    ranking_operadores: [{ login: 'a', operador: 'Ana', supervisor: 'S', total: rk.total, cpc: rk.cpc, sucesso: 0, recusa: 0 }],
    discagens: {
      kpis: {
        dialed: 100,
        contact: 40,
        tabuladas: dial.tab,
        cpc: 0,
        sucesso: 0,
        contact_rate: 40,
        cpc_rate: dial.cpcRate,
        efficacy: 0,
        desligue_agente_rate: 10,
      },
    },
  } as unknown as EvaPayload;
}

describe('agregarEvaPeriodo', () => {
  it('CPC casa soma numerador/denominador; dialer pondera pelas tabuladas', () => {
    const r = agregarEvaPeriodo(
      [dia('2026-09-01', { total: 10, cpc: 5 }, { tab: 10, cpcRate: 50 }), dia('2026-09-02', { total: 30, cpc: 27 }, { tab: 30, cpcRate: 70 })],
      { de: '2026-09-01', ate: '2026-09-03', diasPedidos: 3, faltando: ['2026-09-03'] },
    );
    expect(r.cpc_casa_pct).toBe(80);
    expect(r.tabuladas_casa).toBe(40);
    expect(r.cpc_pct).toBe(65);
    expect(r.eva_drop_pct).toBe(10);
    expect(r).toMatchObject({ dias_com_dados: 2, dias_pedidos: 3, faltando: ['2026-09-03'] });
  });

  it('sem snapshots não inventa taxa', () => {
    const r = agregarEvaPeriodo([], { de: '2026-09-01', ate: '2026-09-01', diasPedidos: 1 });
    expect(r.cpc_pct).toBeUndefined();
    expect(r.cpc_casa_pct).toBeUndefined();
    expect(r.dias_com_dados).toBe(0);
  });
});

describe('janelaEixoRadar', () => {
  it('erro segue o período; fila/advertências/atestados são ao vivo', () => {
    expect(janelaEixoRadar('erro-alto', false)).toBe('período');
    expect(janelaEixoRadar('port-fila', true)).toBe('ao vivo');
    expect(janelaEixoRadar('adv-critico', true)).toBe('ao vivo');
    expect(janelaEixoRadar('inss-sla', true)).toBe('ao vivo');
    expect(janelaEixoRadar('eva-stale', true)).toBe('ao vivo');
  });

  it('CPC/DROP só seguem o período com snapshot EVA', () => {
    expect(janelaEixoRadar('cpc-baixo', true)).toBe('período');
    expect(janelaEixoRadar('eva-drop', false)).toBe('ao vivo');
    expect(janelaEixoRadar('desconhecido', true)).toBeNull();
  });

  it('periodoIncluiHoje', () => {
    expect(periodoIncluiHoje('2026-09-22', '2026-09-28', '2026-09-28')).toBe(true);
    expect(periodoIncluiHoje('2026-08-01', '2026-08-31', '2026-09-28')).toBe(false);
  });
});
