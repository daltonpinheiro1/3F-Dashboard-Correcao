import { describe, expect, it } from 'vitest';
import {
  categorizarMotivoCancelamento,
  hintFromRows,
  montarMatrixPayload,
  parseMatrixVersion,
  pivotarFilaStatus,
  stripMatrixTag,
} from './portabilidadeMatrix';

describe('portabilidadeMatrix', () => {
  it('parseia tag [mx:] dos adjustments', () => {
    expect(parseMatrixVersion('Conflito data [mx:abcd1234]')).toBe('abcd1234');
    expect(parseMatrixVersion('abcd1234')).toBe('');
    expect(stripMatrixTag('Conflito | data [mx:abcd1234]')).toBe('Conflito | data');
  });

  it('categoriza os motivos reais de cancelamento (acentos e ordem)', () => {
    const casos: Array<[string, string]> = [
      ['Rejeição do Cliente via SMS', 'rejeicao_cliente'],
      ['Sem Resposta do SMS do Cliente', 'sem_resposta_sms'],
      ['Data da portabilidade fora da janela de reagendamento', 'janela_reagendamento'],
      ['Status da portabilidade diferente de Conflito', 'status_divergente'],
      ['Cancelamento Automático pela BDR', 'bdr_automatico'],
      ['Cancelamento pelo Cliente', 'cancelado_cliente'],
      ['Nenhum bilhete de portabilidade encontrado', 'sem_bilhete'],
      ['Escalonamento: reschedule 3x falha → cancel', 'escalonamento'],
      ['CPF Inválido', 'cpf_invalido'],
    ];
    for (const [motivo, cat] of casos) expect(categorizarMotivoCancelamento(motivo)).toBe(cat);
  });

  it('pivota a fila por status em propostas', () => {
    expect(
      pivotarFilaStatus([
        { acao: 'cancel', status: 'cancelado', linhas: 1285, propostas: 200 },
        { acao: 'cancel', status: 'concluida', linhas: 209, propostas: 153 },
        { acao: 'cancel', status: 'executando', linhas: 2, propostas: 2 },
        { acao: 'activate', status: 'bko', linhas: 3, propostas: 3 },
      ]),
    ).toEqual([
      { acao: 'cancel', executada: 153, pendente: 2, descartada: 200, outros: 0, linhas: 1496 },
      { acao: 'activate', executada: 0, pendente: 0, descartada: 0, outros: 3, linhas: 3 },
    ]);
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

  it('separa fila de decisões executadas quando retornos vêm vazios', () => {
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
    expect(payload.decisoes).toEqual([]);
    expect(payload.fila_acoes[0]).toEqual({ label: 'open', count: 2 });
    expect(payload.matrix_version).toBe('d4c53ecf');
    expect(payload.canceladas.categorias.restricao).toBe(1);
  });

  it('expõe cobertura e truncamento sem converter limite em universo completo', () => {
    const payload = montarMatrixPayload({
      dias: 30,
      retornos: [{ operacao: 'consult' }],
      cancelamentos: [],
      fila: [{ acao: 'activate' }],
      truncados: { retornos: true },
    });
    expect(payload.cobertura.retornos).toEqual({ lidos: 1, truncado: true });
    expect(payload.cobertura.fila).toEqual({ lidos: 1, truncado: false });
  });

  it('hintFromRows lê o primeiro [mx:] válido', () => {
    expect(hintFromRows([{ adjustments: 'x' }, { adjustments: 'ok [mx:d4c53ecf]' }])).toEqual({
      matrix_version: 'd4c53ecf',
      matrix_version_tag: '[mx:d4c53ecf]',
    });
  });
});
