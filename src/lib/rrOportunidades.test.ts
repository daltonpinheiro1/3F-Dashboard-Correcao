import { describe, expect, it } from 'vitest';
import { decomporGapRr } from './rrOportunidades';
import { buildRrPeriodo, metaJanelaRr } from './rrPeriodo';
import type { EvaPayload } from './evaDash';

describe('decomporGapRr', () => {
  it('atribui o gap aos piores supervisores e sugere subir à mediana', () => {
    const { fontes, oportunidades } = decomporGapRr([
      { supervisor: 'Ana', vendas: 20, metaDia: 20, gap: 0, pctMeta: 100, pctCpc: 60 },
      { supervisor: 'Bruno', vendas: 4, metaDia: 20, gap: -16, pctMeta: 20, pctCpc: 40, alertaCpc: true },
      { supervisor: 'Carla', vendas: 10, metaDia: 20, gap: -10, pctMeta: 50, pctCpc: 55 },
    ]);
    expect(fontes[0]?.label).toBe('Bruno');
    expect(fontes[0]?.pct).toBeGreaterThan(50);
    expect(oportunidades.some((o) => o.tipo === 'gap_sup' && o.impacto > 0)).toBe(true);
  });
});

describe('buildRrPeriodo', () => {
  it('soma EVA comercial e não mistura BKO em TODAS', () => {
    const p = (data: string, port: number, bko: number): EvaPayload =>
      ({
        data,
        updated_at: `${data}T18:00:00`,
        kpis_operacao: {},
        kpis_chamadas: {},
        jornada: [
          { supervisor_name: 'Ana', campanha_op: 'PORTABILIDADE', sucesso: port, cpc: 5, tabuladas: 10, login: 'a' },
          { supervisor_name: 'Bko', campanha_op: 'ACAO_BKO', sucesso: bko, cpc: 8, tabuladas: 10, login: 'b' },
        ],
        pausas_por_tipo: [],
        chamadas_recente: [],
        top_tabulacao: [],
        por_campanha: [],
        serie_hora: [
          { hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso: port, pct_cpc: 50 },
          { hora: '10', campanha_op: 'ACAO_BKO', total: 10, cpc: 8, sucesso: bko, pct_cpc: 80 },
        ],
        ranking_operadores: [],
      }) as unknown as EvaPayload;

    const snap = buildRrPeriodo({
      payloads: [p('2026-09-07', 10, 40), p('2026-09-08', 5, 40)],
      campanha: 'TODAS',
      metaMensal: 1000,
      from: '2026-09-07',
      to: '2026-09-08',
    });
    expect(snap.vendas).toBe(15);
    expect(snap.supervisores.some((s) => s.supervisor === 'Bko')).toBe(false);
    expect(metaJanelaRr(1000, '2026-09-07', '2026-09-08', '2026-09-08')).toBeGreaterThan(0);
  });
});
