import { describe, expect, it } from 'vitest';
import { nomeDetectadoDivergente, nomesCompativeis, semAcentos, tokensNome } from './atestadosNomes';

describe('atestadosNomes', () => {
  it('normaliza acentos e remove conectivos', () => {
    expect(semAcentos('João Ávila')).toBe('joao avila');
    expect(tokensNome('Maria da Conceição dos Santos')).toEqual(['maria', 'conceicao', 'santos']);
  });

  it('casa por palavras completas com mínimo de 2', () => {
    expect(nomesCompativeis('Maria Souza', 'MARIA SOUZA LIMA')).toBe(true);
    expect(nomesCompativeis('José Lima', 'jose lima')).toBe(true);
    expect(nomesCompativeis('Ana', 'Ana Paula Silva')).toBe(false);
    expect(nomesCompativeis('Mari Souza', 'Mariana Souza')).toBe(false);
    expect(nomesCompativeis('Maria da', 'Maria da Silva')).toBe(false);
    expect(nomesCompativeis('', 'Maria Silva')).toBe(false);
  });

  it('nome detectado pela IA comparado sem acentos', () => {
    expect(nomeDetectadoDivergente('Conceição Araújo', 'CONCEICAO ARAUJO')).toBe(false);
    expect(nomeDetectadoDivergente('João Pedro Alves', 'Pedro Alves João')).toBe(false);
    expect(nomeDetectadoDivergente('Conceição Araújo', 'Marcos Teixeira')).toBe(true);
    expect(nomeDetectadoDivergente('Ana', 'Bruno')).toBe(false);
  });
});
