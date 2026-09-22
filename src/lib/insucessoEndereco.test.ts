import { describe, expect, it } from 'vitest';
import { lerInsucessoEntrega } from './insucessoEndereco';

describe('lerInsucessoEntrega', () => {
  it('mostra o campo corrigido quando a Toutbox cancelou por endereço', () => {
    const leitura = lerInsucessoEntrega(
      'Entrega Cancelada - Endereço inválido',
      'Entrega Cancelada',
      { logradouro: { de: 'Rua A', para: 'Rua B' }, referencia: { de: 'x', para: 'y' } },
      ['logradouro_incorreto'],
    );
    expect(leitura.causa).toBe('endereco');
    expect(leitura.diffs).toEqual([{ campo: 'Logradouro', de: 'Rua A', para: 'Rua B' }]);
  });

  it('não trata área de risco como erro de digitação', () => {
    const leitura = lerInsucessoEntrega(
      'Entrega Cancelada - Área de Risco',
      'Entrega Cancelada',
      { cep: { de: '1', para: '2' } },
      ['cep_incorreto'],
    );
    expect(leitura.causa).toBe('risco');
    expect(leitura.diffs).toEqual([]);
  });
});
