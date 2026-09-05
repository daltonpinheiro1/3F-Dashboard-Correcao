import { describe, expect, it } from 'vitest';
import {
  categorizarMotivoCancelamento,
  hintFromRows,
  montarMatrixPayload,
  parseMatrixVersion,
  stripMatrixTag,
} from './portabilidadeMatrix';

describe('portabilidadeMatrix', () => {
  it('parseia tag [mx:] dos adjustments', () => {
    expect(parseMatrixVersion('Conflito data [mx:abcd1234]')).toBe('abcd1234');
    expect(parseMatrixVersion('abcd1234')).toBe('');
    expect(stripMatrixTag('Conflito | data [mx:abcd1234]')).toBe('Conflito | data');
  });

  it('categoriza motivos de cancelamento', () => {
    expect(categorizarMotivoCancelamento('Conflito de data passada')).toBe('conflito_data');
    expect(categorizarMotivoCancelamento('ALWAYS_IGNORE bilhete')).toBe('always_ignore');
    expect(categorizarMotivoCancelamento('matrix_unknown motivo X')).toBe('matrix_unknown');
    expect(categorizarMotivoCancelamento('CPF inválido')).toBe('cpf_invalido');
    expect(categorizarMotivoCancelamento('Restrição cadastral')).toBe('restricao');
  });

  it('agrega decisões e versão mais frequente', () => {
    const payload = montarMatrixPayload({
      dias: 7,
      agora: new Date('2026-09-03T12:00:00Z'),
      retornos: [
        { operacao: 'consult', adjustments: 'ok [mx:aaaa1111]' },
        { acao_decidida: 'reschedule', adjustments: 'conflito [mx:bbbb2222]' },
        { operacao: 'consult', adjustments: 'retry [mx:aaaa1111]' },
        { operacao: 'no_action', adjustments: 'ALWAYS_IGNORE [mx:aaaa1111]' },
      ],
      cancelamentos: [
        { retorno_motivo: 'Conflito de data passada' },
        { retorno_motivo: 'CPF inválido' },
      ],
    });
    expect(payload.matrix_version).toBe('aaaa1111');
    expect(payload.matrix_version_tag).toBe('[mx:aaaa1111]');
    expect(payload.decisoes[0]).toEqual({ label: 'consult', count: 2 });
    expect(payload.decisoes.every((d) => d.label !== 'no_action')).toBe(true);
    expect(payload.canceladas.total_executados).toBe(2);
    expect(payload.canceladas.categorias.conflito_data).toBe(1);
    expect(payload.canceladas.categorias.cpf_invalido).toBe(1);
    expect(payload.fonte).toBe('retornos');
  });

  it('usa a fila quando retornos vêm vazios (colunas ausentes / 400)', () => {
    const payload = montarMatrixPayload({
      dias: 7,
      retornos: [],
      cancelamentos: [{ retorno_motivo: 'Restrição TIM [mx:d4c53ecf]' }],
      fila: [
        { acao: 'open', retorno_motivo: 'chip ok' },
        { acao: 'open', retorno_motivo: 'chip ok' },
        { acao: 'cancel', resultado_mensagem: 'CPF inválido' },
      ],
    });
    expect(payload.fonte).toBe('fila');
    expect(payload.decisoes[0]).toEqual({ label: 'open', count: 2 });
    expect(payload.matrix_version).toBe('d4c53ecf');
    expect(payload.canceladas.categorias.restricao).toBe(1);
  });

  it('hintFromRows lê o primeiro [mx:] válido', () => {
    expect(hintFromRows([{ adjustments: 'x' }, { adjustments: 'ok [mx:d4c53ecf]' }])).toEqual({
      matrix_version: 'd4c53ecf',
      matrix_version_tag: '[mx:d4c53ecf]',
    });
  });
});
