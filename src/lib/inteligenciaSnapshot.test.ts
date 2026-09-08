import { describe, expect, it } from 'vitest';
import {
  asPct,
  alertaDesvioCasa,
  evaStaleMin,
  extractDisparosSignals,
  extractEvaSignals,
  extractFunilP0,
  horasRestantesExpediente,
  journeyToTriage,
  ritmoVendasOpHora,
} from './inteligenciaSnapshot';
import type { EvaPayload } from './evaDash';

describe('inteligenciaSnapshot', () => {
  it('asPct trata fração e percentual', () => {
    expect(asPct(0.6)).toBe(60);
    expect(asPct(60)).toBe(60);
    expect(asPct(140)).toBeUndefined();
  });

  it('horas restantes no expediente BRT', () => {
    const meio = new Date('2026-09-05T15:00:00.000Z'); // 12h BRT
    expect(horasRestantesExpediente(meio)).toBe(6);
    const noite = new Date('2026-09-05T22:00:00.000Z'); // 19h BRT
    expect(horasRestantesExpediente(noite)).toBe(0.5);
  });

  it('stale EVA e CPC do discagens', () => {
    const eva = {
      updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
      data: '2026-09-05',
      kpis_operacao: {},
      kpis_chamadas: {},
      jornada: [{ login: 'a' }, { login: 'b' }],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
      ranking_operadores: [],
      discagens: {
        kpis: {
          dialed: 100,
          contact: 40,
          tabuladas: 30,
          cpc: 18,
          sucesso: 12,
          contact_rate: 40,
          cpc_rate: 60,
          efficacy: 12,
          desligue_rate: 8,
          desligue_agente_rate: 14,
        },
      },
    } as unknown as EvaPayload;
    const s = extractEvaSignals(eva);
    expect(s.cpc_pct).toBe(60);
    expect(s.eva_drop_pct).toBe(14);
    expect(s.vendas_hoje).toBe(12);
    expect(s.n_operadores).toBe(2);
    expect(s.cpc_casa_pct).toBeUndefined();
    expect(evaStaleMin(eva.updated_at)).toBeGreaterThanOrEqual(11);
  });

  it('CPC casa vem do ranking e não substitui o dialer', () => {
    const eva = {
      updated_at: new Date().toISOString(),
      data: '2026-09-08',
      kpis_operacao: {},
      kpis_chamadas: {},
      jornada: [{ login: 'a' }],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
      ranking_operadores: [{ login: 'a', operador: 'Ana', supervisor: 'S', total: 20, cpc: 13, sucesso: 4, recusa: 1 }],
      discagens: {
        kpis: {
          dialed: 100,
          contact: 40,
          tabuladas: 30,
          cpc: 18,
          sucesso: 12,
          contact_rate: 40,
          cpc_rate: 60,
          efficacy: 12,
          desligue_agente_rate: 14,
        },
      },
    } as unknown as EvaPayload;
    const s = extractEvaSignals(eva);
    expect(s.cpc_pct).toBe(60);
    expect(s.cpc_casa_pct).toBe(65);
    expect(s.tabuladas_casa).toBe(20);
  });

  it('CPC casa recorta o chip EVA igual à Chamadas', () => {
    const eva = {
      updated_at: new Date().toISOString(),
      data: '2026-09-08',
      kpis_operacao: {},
      kpis_chamadas: {},
      jornada: [],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
      ranking_operadores: [
        { login: 'a', operador: 'Ana', supervisor: 'S', campanha_op: 'PORTABILIDADE', total: 20, cpc: 13, sucesso: 4, recusa: 1 },
        { login: 'b', operador: 'Bia', supervisor: 'S', campanha_op: 'MIGRACAO', total: 80, cpc: 8, sucesso: 1, recusa: 0 },
      ],
      discagens: { kpis: { cpc_rate: 60, desligue_agente_rate: 10 } },
    } as unknown as EvaPayload;
    expect(extractEvaSignals(eva, Date.now(), 'PORTABILIDADE').cpc_casa_pct).toBe(65);
    expect(extractEvaSignals(eva, Date.now(), 'PORTABILIDADE').tabuladas_casa).toBe(20);
    expect(extractEvaSignals(eva, Date.now(), 'PORTABILIDADE').cpc_pct).toBeUndefined();
  });

  it('CPC e DROP dialer recortam o chip — não usam kpis globais', () => {
    const eva = {
      updated_at: new Date().toISOString(),
      data: '2026-09-08',
      kpis_operacao: {},
      kpis_chamadas: {},
      jornada: [],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
      ranking_operadores: [],
      discagens: {
        kpis: {
          dialed: 250,
          contact: 130,
          tabuladas: 100,
          cpc: 21,
          sucesso: 5,
          contact_rate: 52,
          cpc_rate: 21,
          efficacy: 2,
          desligue_agente: 18,
          desligue_agente_rate: 18,
        },
        por_campanha: [
          {
            campanha_op: 'PORTABILIDADE',
            dialed: 50,
            contact: 30,
            tabuladas: 20,
            cpc: 13,
            sucesso: 4,
            cpc_rate: 65,
          },
          {
            campanha_op: 'MIGRACAO',
            dialed: 200,
            contact: 100,
            tabuladas: 80,
            cpc: 8,
            sucesso: 1,
            cpc_rate: 10,
          },
        ],
        por_operador: [
          {
            user_name: 'Ana',
            campanha_op: 'PORTABILIDADE',
            tabuladas: 20,
            desligue_agente: 2,
            cpc: 13,
            sucesso: 4,
          },
          {
            user_name: 'Bia',
            campanha_op: 'MIGRACAO',
            tabuladas: 80,
            desligue_agente: 16,
            cpc: 8,
            sucesso: 1,
          },
        ],
      },
    } as unknown as EvaPayload;
    const port = extractEvaSignals(eva, Date.now(), 'PORTABILIDADE');
    expect(port.cpc_pct).toBe(65);
    expect(port.eva_drop_pct).toBe(10);
    const todas = extractEvaSignals(eva, Date.now(), 'TODAS');
    expect(todas.cpc_pct).toBe(21);
    expect(todas.eva_drop_pct).toBe(18);
  });

  it('P0 conta oportunidades da fila, não mais_24h', () => {
    expect(
      extractFunilP0({
        gerencial: { bko: 51, quebras: 0, taxa_quebra_pct: 0 },
        reconciliacao: { universo: 1000, soma_fatias: 1000, fecha: true, em_voo: 10, fechados: 20, orfaos: 0 },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      extractFunilP0({
        gerencial: { bko: 10, quebras: 0, taxa_quebra_pct: 0 },
        reconciliacao: { universo: 1000, soma_fatias: 1000, fecha: true, em_voo: 10, fechados: 20, orfaos: 0 },
      }),
    ).toBe(0);
  });

  it('ritmo vendas/op/hora e alerta 2 p.p.', () => {
    expect(ritmoVendasOpHora({ vendasHoje: 12, nOperadores: 6, horasDecorridas: 6 }).ritmo).toBe(0.333);
    expect(ritmoVendasOpHora({ vendasHoje: 0, nOperadores: 6, horasDecorridas: 6 }).fallback).toBe(true);
    expect(alertaDesvioCasa(60, 65)).toBe(true);
    expect(alertaDesvioCasa(60, 61.5)).toBe(false);
  });

  it('DROP da Inteligência não cai no desligue_rate (evento/queda)', () => {
    const eva = {
      updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
      data: '2026-09-04',
      kpis_operacao: {},
      kpis_chamadas: {},
      jornada: [],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
      ranking_operadores: [],
      discagens: {
        kpis: {
          dialed: 10,
          contact: 5,
          tabuladas: 4,
          cpc: 2,
          sucesso: 1,
          contact_rate: 50,
          cpc_rate: 50,
          efficacy: 10,
          desligue_rate: 40,
        },
      },
    } as unknown as EvaPayload;
    expect(extractEvaSignals(eva).eva_drop_pct).toBeUndefined();
  });

  it('extrai fila/BKO dos disparos', () => {
    const d = extractDisparosSignals({
      totais_ao_vivo: { pendentes: 220, bko: 90, falha: 18, concluidas: 10 },
      pendentes_por_idade: { mais_24h: 40, ultimas_6h: 12 },
    });
    expect(d.portabilidade_fila).toBe(220);
    expect(d.portabilidade_mais_24h).toBe(40);
    expect(d.portabilidade_bko).toBe(90);
    expect('portabilidade_p0' in d).toBe(false);
  });

  it('journey → triage sem mock', () => {
    const t = journeyToTriage('3F-1', {
      timeline: [
        { ts: new Date(Date.now() - 5 * 3600_000).toISOString(), fonte: 'ce', titulo: 'CE', detalhe: 'OS 1-2 · ticket=Pendente', status: 'Pendente' },
        { ts: new Date().toISOString(), fonte: 'fila', titulo: 'cancel', detalhe: 'CPF inválido', status: 'concluida' },
      ],
    });
    expect(t.ultimo_erro).toMatch(/CPF/i);
    expect(t.tem_os).toBe(true);
    expect(t.tentativas).toBe(1);
  });
});
