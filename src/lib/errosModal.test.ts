import { describe, expect, it } from 'vitest';
import { filtrarPropostasErro, propostasUnicasErro } from './errosModal';

const rows = [
  { id: '5', proposta_id: 'P1', vendedor: 'João Silva', equipe: 'Alfa' },
  { id: '4', proposta_id: 'P1', vendedor: 'João Silva', equipe: 'Alfa' },
  { id: '3', proposta_id: 'P2', vendedor: 'roboadm3', equipe: 'Alfa' },
  { id: '2', proposta_id: 'P2', vendedor: 'Maria', equipe: 'Beta' },
  { id: '1', proposta_id: 'P3', vendedor: 'Carlos', equipe: 'Beta' },
];

describe('errosModal', () => {
  it('uma linha por proposta, a mais recente, sem robô', () => {
    expect(propostasUnicasErro(rows).map((r) => r.id)).toEqual(['5', '2', '1']);
  });

  it('busca sem acento e sem caixa sobre o conjunto inteiro', () => {
    const unicas = propostasUnicasErro(rows);
    expect(filtrarPropostasErro(unicas, 'joao').map((r) => r.id)).toEqual(['5']);
    expect(filtrarPropostasErro(unicas, ' BETA ').map((r) => r.id)).toEqual(['2', '1']);
    expect(filtrarPropostasErro(unicas, 'p3').map((r) => r.id)).toEqual(['1']);
    expect(filtrarPropostasErro(unicas, '')).toHaveLength(3);
  });
});
