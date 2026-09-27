import { describe, expect, it } from 'vitest';
import { fonteDoDia } from './evaDash';

describe('fonte do dia EVA', () => {
  it('dia aberto lê o live e dia fechado lê o arquivo', () => {
    expect(fonteDoDia('2026-09-25', '2026-09-25')).toBe('live');
    expect(fonteDoDia('2026-09-24', '2026-09-25')).toBe('historico');
  });
});
