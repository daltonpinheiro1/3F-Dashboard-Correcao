import { describe, expect, it } from 'vitest';
import { enderecoCadastrado, lerInsucessoEntrega } from './insucessoEndereco';

describe('enderecoCadastrado', () => {
  it('junta o valor gravado e ignora campo vazio', () => {
    expect(enderecoCadastrado({
      logradouro: { de: 'Rua A', para: 'Rua B' },
      numero: { de: '10', para: '10' },
      cidade: { de: '', para: '' },
      uf: { de: 'SP', para: 'SP' },
    })).toBe('Rua B, 10, SP');
  });
});

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

  it('aponta CEP e número inválidos no endereço que foi para a entrega', () => {
    const leitura = lerInsucessoEntrega(
      'Entrega Cancelada - Problema endereço entrega',
      'Entrega Cancelada',
      {
        cep: { de: '01310-100', para: '01310-100' },
        numero: { de: 'SN', para: 'SN' },
        logradouro: { de: 'Rua das Flores QD 4', para: 'Rua das Flores QD 4' },
        cidade: { de: 'Sao Paulo', para: 'Sao Paulo' },
        uf: { de: 'RJ', para: 'RJ' },
      },
      [],
    );
    expect(leitura.causa).toBe('endereco');
    expect(leitura.titulo).toBe('Problema no endereço');
    expect(leitura.indicios.map((i) => i.campo)).toEqual(['Logradouro', 'Número', 'CEP × UF']);
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
    expect(leitura.indicios).toEqual([]);
  });
});
