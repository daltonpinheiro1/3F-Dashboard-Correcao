import { describe, expect, it } from 'vitest';
import {
  asPct,
  evaStaleMin,
  extractDisparosSignals,
  extractEvaSignals,
  horasRestantesExpediente,
  journeyToTriage,
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
    expect(evaStaleMin(eva.updated_at)).toBeGreaterThanOrEqual(11);
  });

  it('extrai fila/BKO dos disparos', () => {
    const d = extractDisparosSignals({
      totais_ao_vivo: { pendentes: 220, bko: 90, falha: 18, concluidas: 10 },
      pendentes_por_idade: { mais_24h: 40, ultimas_6h: 12 },
    });
    expect(d.portabilidade_fila).toBe(220);
    expect(d.portabilidade_mais_24h).toBe(40);
    expect(d.portabilidade_bko).toBe(90);
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
