import { describe, expect, it } from 'vitest';
import { cuboFilterValue } from './cubo-query';

describe('cubo-query encoding', () => {
  it('deixa a codificação para URLSearchParams sem duplicar percentuais', () => {
    const params = new URLSearchParams();
    params.append(
      'tipos_erro',
      cuboFilterValue({ column: 'tipos_erro', op: 'contains', value: ['ação & cep'] }),
    );
    params.append(
      'vendedor',
      cuboFilterValue({ column: 'vendedor', op: 'eq', value: 'José % Silva' }),
    );

    const roundTrip = new URLSearchParams(params.toString());
    expect(roundTrip.get('tipos_erro')).toBe('cs.["ação & cep"]');
    expect(roundTrip.get('vendedor')).toBe('eq.José % Silva');
    expect(params.toString()).not.toContain('%25C3');
  });

  it('escapa valores textuais do operador in', () => {
    expect(
      cuboFilterValue({
        column: 'fluxo',
        op: 'in',
        value: ['portabilidade', 'e"sim', 'com,virgula'],
      }),
    ).toBe('in.("portabilidade","e\\"sim","com,virgula")');
  });
});
