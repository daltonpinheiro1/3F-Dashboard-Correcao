import { describe, expect, it } from 'vitest';
import {
  buildForecastDia,
  buildMonteCarloDia,
  buildNowcast,
  horaKey,
  alocarMetaDiaPorSupervisor,
  mergeMotivo,
  mergeOps,
  mergeSerie,
  motivoSourceLabel,
  resolveHoraComercialRefs,
  vendasPorHoraFromSerie,
  crivoDoIntervalo,
  buildFunilConversaoHora,
  buildHeatmapConsolidados,
} from './horaPageData';
import type { EvaPayload, EvaSerieHora } from './evaDash';

describe('horaPageData', () => {
  it('horaKey normaliza', () => {
    expect(horaKey(9)).toBe('09');
    expect(horaKey('10')).toBe('10');
  });

  it('mergeSerie agrega por hora+campanha', () => {
    const hist = [
      {
        serie_hora: [
          { hora: '09', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso: 2, aprovadas: 1 },
          { hora: '09', campanha_op: 'PORTABILIDADE', total: 4, cpc: 1, sucesso: 1, aprovadas: 2 },
        ],
      },
    ] as unknown as EvaPayload[];
    const rows = mergeSerie(hist);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(14);
    expect(rows[0].cpc).toBe(6);
    expect(rows[0].aprovadas).toBe(3);
    expect(rows[0].pct_cpc).toBe(42.9);
  });

  it('resolve refs comerciais de TODAS e mantém Controle coerente com Migração', () => {
    const refs = {
      metaPort: 2300,
      metaMig: 1700,
      metaBko: 900,
      metaCc: 400,
      metaAlgar: 150,
      expedientePort: 10,
      expedienteMig: 8,
      expedienteBko: 6,
      expedienteCc: 7,
      expedienteAlgar: 5,
    };
    expect(resolveHoraComercialRefs('TODAS', refs)).toEqual({
      metaVendasMes: 4000,
      expedienteHoras: 9,
    });
    expect(resolveHoraComercialRefs('CONTROLE_CONTROLE', refs)).toEqual({
      metaVendasMes: 400,
      expedienteHoras: 7,
    });
    expect(resolveHoraComercialRefs('ACAO_BKO', refs).metaVendasMes).toBe(900);
    expect(resolveHoraComercialRefs('ALGAR', refs)).toEqual({
      metaVendasMes: 150,
      expedienteHoras: 5,
    });
  });

  it('merge histórico pondera TMA por volume, sem last-write', () => {
    const hist = [
      {
        hora_operador: [
          { hora: '09', login: 'op', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, tma_seg: 100 },
          { hora: '09', login: 'op', campanha_op: 'PORTABILIDADE', total: 30, cpc: 15, tma_seg: 300 },
        ],
        hora_motivo: [
          { hora: '09', nome: 'X', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, tma_seg: 100 },
          { hora: '09', nome: 'X', campanha_op: 'PORTABILIDADE', total: 30, cpc: 15, tma_seg: 300 },
        ],
      },
    ] as unknown as EvaPayload[];
    expect(mergeOps(hist)[0].tma_seg).toBe(250);
    expect(mergeMotivo(hist)[0].tma_seg).toBe(250);
  });

  it('motivoSourceLabel', () => {
    expect(motivoSourceLabel('operador_payload')).toBe('Operador');
    expect(motivoSourceLabel('x')).toBe('Indisponível');
  });

  it('buildForecastDia usa ritmo das últimas horas no cenário realista', () => {
    const serie = [
      { hora: '09', sucesso: 10, total: 20, cpc: 5, campanha_op: 'X' },
      { hora: '10', sucesso: 12, total: 20, cpc: 6, campanha_op: 'X' },
      { hora: '11', sucesso: 14, total: 20, cpc: 7, campanha_op: 'X' },
    ] as EvaSerieHora[];
    const fc = buildForecastDia(serie, 36, 3, 80);
    expect(fc?.realista).toBe(75); // 36 + ((12+14)/2)*3
    expect(fc?.otimista).toBe(78); // 36 + 14*3
    expect(fc?.pessimista).toBe(66); // 36 + 10*3
    expect(vendasPorHoraFromSerie(serie)).toEqual([10, 12, 14]);
  });

  it('distribui meta de supervisor por capacidade, não pelo realizado', () => {
    const now = buildNowcast(
      [{ hora: '09', total: 20, sucesso: 10 }],
      [
        { hora: '09', supervisor: 'A', total: 10, cpc: 5, sucesso: 9, pct_cpc: 50 },
        { hora: '09', supervisor: 'B', total: 10, cpc: 5, sucesso: 1, pct_cpc: 50 },
      ],
      2300,
      8,
      '2026-09-03',
      '09',
      { A: 1, B: 3 },
    );
    const a = now.supRows.find((r) => r.supervisor === 'A');
    const b = now.supRows.find((r) => r.supervisor === 'B');
    expect(b!.metaDiaSup).toBeCloseTo(a!.metaDiaSup * 3, 1);
  });

  it('alocarMetaDiaPorSupervisor não estoura a meta do dia', () => {
    const aloc = alocarMetaDiaPorSupervisor(['A', 'B', 'C'], 100, { A: 1, B: 1, C: 1 });
    const soma = Object.values(aloc).reduce((s, n) => s + n, 0);
    expect(soma).toBeCloseTo(100, 0);
  });

  it('buildMonteCarloDia calcula probabilidade sobre meta do dia', () => {
    const serie = [
      { hora: '09', sucesso: 10, total: 20, cpc: 5, campanha_op: 'X' },
      { hora: '10', sucesso: 12, total: 20, cpc: 6, campanha_op: 'X' },
      { hora: '11', sucesso: 14, total: 20, cpc: 7, campanha_op: 'X' },
    ] as EvaSerieHora[];
    const forecast = buildForecastDia(serie, 36, 3, 80);
    expect(forecast).not.toBeNull();
    let seed = 0;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const mc = buildMonteCarloDia(forecast!, vendasPorHoraFromSerie(serie), { sims: 500, rng });
    expect(mc?.meta).toBe(80);
    expect(mc?.forecastRealista).toBe(75);
    expect(mc?.projecaoP50).toBeGreaterThan(0);
    expect(mc?.probabilidade).toBeGreaterThanOrEqual(0);
    expect(mc?.probabilidade).toBeLessThanOrEqual(100);
  });

  it('crivo do intervalo usa VB da série, não o dia', () => {
    const serie = [
      { hora: '14', vb: 10, aprovadas: 4 },
      { hora: '15', vb: 100, aprovadas: 90 },
    ];
    const c = crivoDoIntervalo(serie, '14');
    expect(c.fonte).toBe('intervalo');
    expect(c.vb).toBe(10);
    expect(c.crivo).toBe(40);
    expect(crivoDoIntervalo(serie, '14').vb).not.toBe(110);
    expect(crivoDoIntervalo([{ hora: '14', vb: 0, aprovadas: 0 }], '14').crivo).toBeNull();
    expect(crivoDoIntervalo(serie, 'todas')).toMatchObject({
      fonte: 'dia',
      vb: 110,
      aprovadas: 94,
      crivo: 85.5,
    });
  });

  it('funil com hora NÃO usa isize_* do dia', () => {
    const serieRitmo = [
      { hora: '10', vb: 12, aprovadas: 5 },
      { hora: '11', vb: 80, aprovadas: 40 },
    ];
    const funil = buildFunilConversaoHora({
      hora: '10',
      tabuladas: 100,
      cpc: 40,
      sucessoEva: 8,
      vbJornada: 999,
      aprovJornada: 888,
      serieRitmo,
      isizeCruzamento: true,
      isizeTotal: 80,
      isizeAceitas: 80,
      isizeAplicavel: true,
    });
    expect(funil.map((f) => f.valor)).toEqual([100, 40, 12, 12, 5]);
    expect(funil[2].etapa).toContain('iSize');
    expect(funil[4].pct).toBe(5);
  });

  it('funil com Hora=Todas usa isize do dia quando aplicável', () => {
    const funil = buildFunilConversaoHora({
      hora: 'todas',
      tabuladas: 807,
      cpc: 470,
      sucessoEva: 90,
      vbJornada: 70,
      aprovJornada: 60,
      serieRitmo: [{ hora: '10', vb: 12, aprovadas: 5 }],
      isizeCruzamento: true,
      isizeTotal: 80,
      isizeAceitas: 80,
      isizeAplicavel: true,
    });
    expect(funil.map((f) => f.valor)).toEqual([807, 470, 80, 80, 80]);
  });

  it('funil com hora sem série NÃO cai no isize do dia', () => {
    const funil = buildFunilConversaoHora({
      hora: '14',
      tabuladas: 50,
      cpc: 20,
      sucessoEva: 7,
      vbJornada: 999,
      aprovJornada: 888,
      serieRitmo: [{ hora: '10', vb: 12, aprovadas: 5 }],
      isizeCruzamento: true,
      isizeTotal: 80,
      isizeAceitas: 80,
      isizeAplicavel: true,
    });
    expect(funil.map((f) => f.valor)).toEqual([50, 20, 7, 0, 0]);
    expect(funil[2].etapa).not.toContain('iSize');
  });

  it('heatmap consolida por hora e por dia', () => {
    const acc = {
      'MARDEN|09': 7,
      'MARDEN|10': 8,
      'TAUANE|09': 9,
      'TAUANE|10': 8,
    };
    const c = buildHeatmapConsolidados(['MARDEN', 'TAUANE'], ['09', '10', '11'], acc);
    expect(c.porHora['09']).toBe(16);
    expect(c.porHora['10']).toBe(16);
    expect(c.porHora['11']).toBe(0);
    expect(c.porSupervisor.MARDEN).toBe(15);
    expect(c.porSupervisor.TAUANE).toBe(17);
    expect(c.totalDia).toBe(32);
  });
});
