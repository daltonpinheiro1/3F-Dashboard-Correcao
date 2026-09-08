import { describe, expect, it } from 'vitest';
import { buildRrPonte } from './rrPonte';
import { acaoAtrasada, acoesPendentesAnteriores, buildRrAcao } from './rrAcoes';
import { mostraRrBloco, produtividadeRr, slidesRrApresentacao, tilesMensais } from './rrVista';
import type { EvaPayload } from './evaDash';

const payload = (data: string, port: number, mig: number): EvaPayload =>
  ({
    data,
    updated_at: `${data}T18:00:00`,
    kpis_operacao: {},
    kpis_chamadas: {},
    jornada: [],
    pausas_por_tipo: [],
    chamadas_recente: [],
    top_tabulacao: [],
    por_campanha: [],
    serie_hora: [
      { hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso: port, pct_cpc: 50 },
      { hora: '10', campanha_op: 'MIGRACAO', total: 10, cpc: 5, sucesso: mig, pct_cpc: 50 },
      { hora: '10', campanha_op: 'ACAO_BKO', total: 10, cpc: 8, sucesso: 99, pct_cpc: 80 },
    ],
    ranking_operadores: [],
  }) as unknown as EvaPayload;

describe('buildRrPonte', () => {
  it('separa Port e Mig em Todas e ignora BKO', () => {
    const p = buildRrPonte({
      campanha: 'TODAS',
      payloads: [payload('2026-09-08', 10, 4)],
      metaPort: 3100,
      metaMig: 3100,
      from: '2026-09-08',
      to: '2026-09-08',
      supervisores: [
        { supervisor: 'Ana', vendas: 10, metaDia: 10, gap: 0, pctMeta: 100, pctCpc: 60 },
        { supervisor: 'Bruno', vendas: 2, metaDia: 10, gap: -8, pctMeta: 20, pctCpc: 40, alertaCpc: true },
      ],
    });
    expect(p.mix.map((f) => f.id)).toEqual(['port', 'mig']);
    expect(p.mix.find((f) => f.id === 'port')?.vendas).toBe(10);
    expect(p.mix.find((f) => f.id === 'mig')?.vendas).toBe(4);
    expect(p.cpcBaixo[0]?.label).toBe('Bruno');
  });
});

describe('rrVista', () => {
  it('tudo mostra qualquer bloco; drivers esconde qualidade', () => {
    expect(mostraRrBloco('tudo', 'qualidade')).toBe(true);
    expect(mostraRrBloco('drivers', 'qualidade')).toBe(false);
    expect(mostraRrBloco('drivers', 'drivers')).toBe(true);
  });

  it('tiles mensais agrupam a série', () => {
    const t = tilesMensais([
      { dia: '2026-08-31', vendas: 10 },
      { dia: '2026-09-01', vendas: 5 },
      { dia: '2026-09-02', vendas: 7 },
    ]);
    expect(t).toEqual([
      { mes: '2026-08', vendas: 10, dias: 1 },
      { mes: '2026-09', vendas: 12, dias: 2 },
    ]);
  });

  it('produtividade não divide por zero', () => {
    expect(produtividadeRr({ vendas: 20, logados: 4, horasTrabalhadas: 5 })).toEqual({
      porLogin: 5,
      porHoraLogin: 1,
    });
    expect(produtividadeRr({ vendas: 20, logados: 0, horasTrabalhadas: 5 }).porLogin).toBe(0);
  });

  it('TV: live tem nowcast; período não; ponte só com mix', () => {
    const live = slidesRrApresentacao({ isLive: true, temMix: true }).map((s) => s.id);
    expect(live[0]).toBe('casa');
    expect(live[1]).toBe('podio');
    expect(live).toContain('forecast');
    const sem = slidesRrApresentacao({ isLive: false, temMix: false }).map((s) => s.id);
    expect(sem[0]).toBe('casa');
    expect(sem).not.toContain('forecast');
    expect(sem).not.toContain('ponte');
  });
});

describe('rrAcoes', () => {
  it('marca atraso e separa o que ficou da última', () => {
    const a = buildRrAcao({
      dataRef: '2026-09-07',
      campanha: 'TODAS',
      horizonte: 'semanal',
      titulo: 'Coaching Bruno',
      owner: 'Ana',
      prazo: '2026-09-07',
      now: new Date('2026-09-07T12:00:00Z'),
    });
    expect(acaoAtrasada(a, '2026-09-08')).toBe(true);
    expect(acaoAtrasada({ ...a, prazo: '2026-09-09' }, '2026-09-08')).toBe(false);
    expect(acoesPendentesAnteriores('TODAS', '2026-09-08')).toEqual([]);
  });
});
