import { describe, expect, it } from 'vitest';
import { csvText } from './pageCsv';

describe('csvText', () => {
  it('escapa aspas, vírgulas e valores ausentes', () => {
    expect(csvText(['nome', 'taxa'], [['Silva, "Jr."', 12.5], [null, undefined]])).toBe(
      '"nome","taxa"\n"Silva, ""Jr.""","12.5"\n"",""',
    );
  });

  it('neutraliza texto que o Excel interpretaria como fórmula', () => {
    expect(csvText(['a'], [['=HYPERLINK("x")'], ['+1+1'], ['@SUM(A1)'], ['-cmd|calc']])).toBe(
      '"a"\n"\'=HYPERLINK(""x"")"\n"\'+1+1"\n"\'@SUM(A1)"\n"\'-cmd|calc"',
    );
  });

  it('preserva números e negativos numéricos', () => {
    expect(csvText(['a', 'b', 'c'], [[-3, '-12,5', 'Equipe - Norte']])).toBe(
      '"a","b","c"\n"-3","-12,5","Equipe - Norte"',
    );
  });
});
