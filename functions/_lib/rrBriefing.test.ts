import { describe, expect, it } from 'vitest';
import { insightUserText, sanitizarBriefingRr } from './rrBriefing';

describe('sanitizarBriefingRr', () => {
  it('não deixa JSON na saída', () => {
    const md = sanitizarBriefingRr(JSON.stringify({ texto: '## Situação\nAbaixo.' }));
    expect(md).toContain('## Situação');
    expect(md.startsWith('{')).toBe(false);
  });
});

describe('insightUserText', () => {
  it('escreve prosa, não dump do payload', () => {
    const t = insightUserText({
      horizonte: 'semanal',
      dataRef: '2026-09-08',
      campanha: 'TODAS',
      vendasEva: 10,
      metaDia: 20,
      pctMeta: 50,
      gap: -10,
      gapPct: -50,
      cpc: 48,
      fontesGap: [{ label: 'Bruno', valor: -8, pct: 80 }],
    });
    expect(t).toContain('Bruno');
    expect(t).toContain('EVA 10');
    expect(t).not.toContain('"fontesGap"');
  });

  it('limita listas e textos livres (ações abertas) antes do LLM', () => {
    const t = insightUserText({
      vendasEva: 1,
      acoesAbertas: Array.from({ length: 300 }, (_, i) => `acao-${i} ${'z'.repeat(400)}`),
    });
    expect(t).toContain('acao-9 ');
    expect(t).not.toContain('acao-10 ');
    expect(t).not.toContain('z'.repeat(250));
  });
});

describe('insightUserText · blocos enviados pela RR', () => {
  it('inclui comparativo, reconcile e Monte Carlo em prosa', () => {
    const t = insightUserText({
      vendasEva: 100,
      comparativo: { vsD1: 12.5, vsD7: -3, mtd: 2100 },
      reconcile: { eva: 120, sms: 100, delta: 20, pct: 16.7, alerta: true },
      monteCarlo: { probabilidade: 28, meta: 300, projecaoP10: 210, projecaoP50: 250, projecaoP90: 290, horasRestantes: 4 },
      mix: [{ label: 'Portabilidade', vendas: 50, meta: 60, metaDia: 120, gap: -10 }],
    });
    expect(t).toContain('vs D-1 +12.5%');
    expect(t).toContain('vs D-7 -3%');
    expect(t).toContain('MTD EVA 2100');
    expect(t).toContain('Gross EVA 120 vs SMS 100');
    expect(t).toContain('ACIMA do limiar');
    expect(t).toContain('P(meta 300) 28%');
    expect(t).toContain('P50 250');
    expect(t).toContain('meta dia 120');
    expect(t).not.toContain('{');
  });
});
