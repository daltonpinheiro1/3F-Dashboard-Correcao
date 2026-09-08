import { describe, expect, it } from 'vitest';
import { normalizarBriefingRr, pareceJsonBriefing } from './rrBriefing';

describe('normalizarBriefingRr', () => {
  it('mantém markdown', () => {
    const md = '## Situação\nCasa abaixo.';
    expect(normalizarBriefingRr(md)).toBe(md);
    expect(pareceJsonBriefing(md)).toBe(false);
  });

  it('extrai campo texto de JSON (o bug da tela)', () => {
    const raw = JSON.stringify({
      texto: '## Situação\nAbaixo 12.\n\n## Risco\nCPC baixo.',
    });
    expect(normalizarBriefingRr(raw)).toContain('## Situação');
    expect(normalizarBriefingRr(raw)).not.toMatch(/^\s*\{/);
  });

  it('monta seções a partir de chaves de comitê', () => {
    const raw = JSON.stringify({
      situacao: 'Gap −20.',
      causas: ['Bruno −16', 'Carla −10'],
      acoes: ['Coaching Bruno hoje', 'Crivo em 2h'],
      risco: 'Trânsito alto',
    });
    const md = normalizarBriefingRr(raw);
    expect(md).toContain('## Situação');
    expect(md).toContain('Bruno −16');
    expect(md).toContain('Coaching Bruno');
    expect(pareceJsonBriefing(md)).toBe(false);
  });

  it('abre fence ```json', () => {
    const inner = JSON.stringify({ briefing: '## Situação\nOk.' });
    expect(normalizarBriefingRr('```json\n' + inner + '\n```')).toBe('## Situação\nOk.');
  });

  it('JSON sem prosa útil não devolve o payload', () => {
    expect(normalizarBriefingRr('{"vendasEva":10,"metaDia":20}')).toBe('');
  });
});
