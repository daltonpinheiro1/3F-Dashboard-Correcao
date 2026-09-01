import { describe, expect, it } from 'vitest';
import {
  computeRiskRadar,
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
