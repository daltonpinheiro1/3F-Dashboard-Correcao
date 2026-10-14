import { describe, expect, it } from 'vitest';
import { aggregateCorrecao } from '../functions/_lib/cuboAggregates';
import { propostasSemRobo, tempoMedioSemRobo } from './correcaoPropostas';

const passagens = [
  { proposta_id: 'p1', vendedor: 'Ana', tipos_erro: ['cep_incorreto'] },
  { proposta_id: 'p1', vendedor: 'roboadm2', tipos_erro: [] },
  { proposta_id: 'p2', vendedor: 'roboadm', tipos_erro: ['bairro_incorreto'] },
  { proposta_id: 'p2', vendedor: 'Roboadm3', tipos_erro: [] },
  { proposta_id: 'p3', vendedor: 'Bia', tipos_erro: [] },
];

describe('propostasSemRobo', () => {
  it('tira só a proposta que nenhum humano cadastrou', () => {
    const rows = propostasSemRobo(passagens);
    expect(rows.map((r) => r.proposta_id).sort()).toEqual(['p1', 'p3']);
    expect(rows.find((r) => r.proposta_id === 'p1')?.vendedor).toBe('Ana');
  });

  it('fecha com o total e o com-erro do cubo-overview', () => {
    const rows = propostasSemRobo(passagens);
    const cubo = aggregateCorrecao(passagens).dashboard;
    expect(rows.length).toBe(cubo.total_propostas);
    expect(rows.filter((r) => (r.tipos_erro || []).length > 0).length).toBe(cubo.total_corrigidas);
  });
});

describe('tempoMedioSemRobo', () => {
  it('média por passagem sem o Roboadm; elapsed ausente conta como zero', () => {
    expect(tempoMedioSemRobo([
      { vendedor: 'Ana', elapsed_ms: 100 },
      { vendedor: ' roboadm7 ', elapsed_ms: 99_000 },
      { vendedor: null, elapsed_ms: null },
      { vendedor: 'Bia', elapsed_ms: 500 },
    ])).toBe(200);
    expect(tempoMedioSemRobo([{ vendedor: 'Roboadm', elapsed_ms: 10 }])).toBe(0);
  });
});
