import { describe, expect, it } from 'vitest';
import {
  computeRiskRadar,
  herfindahl,
  normalCdf,
  paretoRows,
  searchKnowledge,
  simulateWhatIf,
  triagePortabilidade,
} from './operacionalIntel';

describe('computeRiskRadar', () => {
  it('score baixo sem sinais', () => {
    const r = computeRiskRadar({ cpc_pct: 68, meta_cpc: 65 });
    expect(r.level).toBe('low');
    expect(r.signals.length).toBe(0);
  });

  it('detecta CPC baixo e P0', () => {
    const r = computeRiskRadar({
      cpc_pct: 50,
      meta_cpc: 65,
      portabilidade_p0: 3,
    });
    expect(r.score).toBeGreaterThan(25);
    expect(r.signals.some((s) => s.id === 'cpc-baixo')).toBe(true);
    expect(r.signals.some((s) => s.id === 'port-p0')).toBe(true);
  });

  it('interação erro alto+tendência e contribuição', () => {
    const r = computeRiskRadar({
      taxa_erro_pct: 22,
      taxa_erro_tendencia: 5,
      erro_concentracao_pct: 48,
    });
    expect(r.signals.some((s) => s.id === 'erro-acelerando')).toBe(true);
    expect(r.contribuicoes[0]?.pct).toBeGreaterThan(0);
    expect(r.interacoes.length).toBeGreaterThan(0);
  });
});

describe('estatística pura', () => {
  it('normalCdf ~ 0.5 no zero e Pareto corta em 60%', () => {
    expect(normalCdf(0)).toBeGreaterThan(0.49);
    expect(normalCdf(0)).toBeLessThan(0.51);
    expect(herfindahl([80, 20])).toBeGreaterThan(0.6);
    const p = paretoRows([
      { label: 'cpf', count: 40 },
      { label: 'cep', count: 25 },
      { label: 'tel', count: 20 },
      { label: 'outros', count: 15 },
    ]);
    expect(p.map((r) => r.label)).toEqual(['cpf', 'cep']);
    expect(p[p.length - 1].acum_pct).toBeGreaterThanOrEqual(60);
    expect(p.length).toBe(2);
  });
});

describe('simulateWhatIf', () => {
  it('reduz vendas ao remover operadores', () => {
    const r = simulateWhatIf({
      operadores_removidos: 2,
      cpc_por_operador_hora: 1.5,
      horas_restantes: 4,
      vendas_atuais: 40,
      meta_dia: 55,
      fila_portabilidade: 20,
      minutos_medio_resolucao: 30,
    });
    expect(r.vendas_projetadas).toBeLessThan(40);
    expect(r.cenarios.pessimista).toBeLessThanOrEqual(r.cenarios.realista);
    expect(r.p_atingir_meta).toBeGreaterThanOrEqual(0);
    expect(r.p10).toBeLessThanOrEqual(r.p50);
  });

  it('não assume equipe = removidos: 2 de 20 mantém capacidade', () => {
    const r = simulateWhatIf({
      operadores_removidos: 2,
      n_operadores: 20,
      cpc_por_operador_hora: 2,
      horas_restantes: 3,
      vendas_atuais: 50,
      meta_dia: 60,
      fila_portabilidade: 0,
      minutos_medio_resolucao: 30,
    });
    expect(r.capacidade_hora).toBe(36);
    expect(r.vendas_projetadas).toBeGreaterThan(0);
  });
});

describe('triagePortabilidade', () => {
  it('classifica sistema', () => {
    const r = triagePortabilidade({
      proposta_id: 'P1',
      ultimo_erro: 'timeout sistema TIM',
      tentativas: 1,
      idade_horas: 2,
      tem_os: true,
    });
    expect(r.classificacao).toBe('sistema');
    expect(r.auto_executavel).toBe(true);
  });

  it('evaluate_return unknown é IGNORAR, nunca recusa', () => {
    const r = triagePortabilidade({
      proposta_id: 'P-UNK',
      ultimo_erro: 'evaluate_return unknown pending_analysis',
      status: 'matrix_unknown recusa aparente',
      tem_os: true,
    });
    expect(r.acao_sugerida).toMatch(/IGNORAR/i);
    expect(r.auto_executavel).toBe(false);
    expect(r.classificacao).not.toBe('cliente');
  });

  it('CPF inválido não é auto-executável', () => {
    const r = triagePortabilidade({
      proposta_id: 'P2',
      ultimo_erro: 'CPF inválido ALWAYS_IGNORE',
      tem_os: true,
    });
    expect(r.classificacao).toBe('operacional');
    expect(r.auto_executavel).toBe(false);
    expect(r.acao_sugerida).toMatch(/Não reenfileirar/i);
  });
});

describe('searchKnowledge', () => {
  const chunks = [
    {
      id: '1',
      categoria: 'operacao',
      titulo: 'Meta CPC',
      conteudo: 'Meta 65%',
      tags: ['cpc'],
    },
  ];
  it('encontra por termo', () => {
    const r = searchKnowledge(chunks, 'cpc meta');
    expect(r[0]?.id).toBe('1');
  });
});
