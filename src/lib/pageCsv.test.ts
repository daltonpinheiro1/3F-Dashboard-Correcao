import { describe, expect, it } from 'vitest';
import { csvText } from './pageCsv';

describe('csvText', () => {
  it('escapa aspas, vírgulas e valores ausentes', () => {
    expect(csvText(['nome', 'taxa'], [['Silva, "Jr."', 12.5], [null, undefined]])).toBe(
      '"nome","taxa"\n"Silva, ""Jr.""","12.5"\n"",""',
    );
  });
});
