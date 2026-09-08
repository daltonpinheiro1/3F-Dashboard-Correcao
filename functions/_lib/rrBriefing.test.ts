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
});
