import { describe, expect, it } from 'vitest';
import { aggregateCorrecao, mergeSms, mergeToutbox } from './cuboAggregates';

describe('cuboAggregates', () => {
  it('ignora tratamentos automáticos e preserva múltiplos vínculos', () => {
    const base = aggregateCorrecao([
      {
        vendedor: 'Ana',
        equipe: 'A',
        supervisor: 'Sup 1',
        tipos_erro: ['referencia_tratamento'],
        campos_alterados: ['referencia'],
        elapsed_ms: 100,
      },
      {
        vendedor: 'Ana',
        equipe: 'B',
        supervisor: 'Sup 2',
        tipos_erro: ['cep_incorreto'],
        campos_alterados: ['cep'],
        elapsed_ms: 300,
      },
    ]);
    expect(base.dashboard).toMatchObject({
      total_propostas: 2,
      total_corrigidas: 1,
      taxa_erro_pct: 50,
      tempo_medio_ms: 200,
      top_erro: 'cep_incorreto',
    });
    expect(base.operadores[0]).toMatchObject({
      vendedor: 'Ana',
      equipe: 'Múltiplas equipes: A, B',
      supervisor: 'Múltiplos supervisores: Sup 1, Sup 2',
      erros_cep: 1,
    });
  });

  it('deduplica SMS pelo retorno mais recente antes de calcular adesão', () => {
    const base = aggregateCorrecao([
      { vendedor: 'Ana', equipe: 'A', supervisor: 'Sup 1', tipos_erro: [] },
    ]);
    const overview = mergeSms(
      base,
      [
        {
          proposta_id: '1',
          vendedor: 'Ana',
          equipe: 'A',
          supervisor: 'Sup 1',
          sms_previo: false,
          classificacao: 'insucesso',
          retorno_atualizado_em: '2026-09-09T10:00:00Z',
        },
        {
          proposta_id: '1',
          vendedor: 'Ana',
          equipe: 'A',
          supervisor: 'Sup 1',
          sms_previo: true,
          ticket_status: 'portado',
          retorno_atualizado_em: '2026-09-09T11:00:00Z',
        },
      ],
      { de: '2026-09-09', ate: '2026-09-09' },
    );
    expect(overview.operadores[0]).toMatchObject({
      sms_total: 1,
      sms_com: 1,
      sms_adesao: 100,
      sms_suc_com: 1,
      sms_pct_suc: 100,
    });
  });

  it('mergeToutbox não altera corrigidas e taxa ignora sem_rastreio', () => {
    const base = mergeSms(
      aggregateCorrecao([{ vendedor: 'Ana', equipe: 'A', supervisor: 'Sup 1', tipos_erro: ['cep_incorreto'] }]),
      [],
      { de: '2026-09-09', ate: '2026-09-09' },
    );
    const out = mergeToutbox(base, [
      { proposta_id: '1', vendedor: 'Ana', supervisor: 'Sup 1', equipe: 'A', status: 'entregue' },
      { proposta_id: '2', vendedor: 'Ana', supervisor: 'Sup 1', equipe: 'A', status: 'insucesso' },
      { proposta_id: '3', vendedor: 'Ana', supervisor: 'Sup 1', equipe: 'A', status: 'sem_rastreio' },
      { proposta_id: '4', vendedor: 'Ana', supervisor: 'Sup 1', equipe: 'A', status: 'fora_escopo' },
    ]);
    expect(out.dashboard.total_corrigidas).toBe(1);
    expect(out.operadores[0].tbx_entregue).toBe(1);
    expect(out.operadores[0].tbx_insucesso).toBe(1);
    expect(out.operadores[0].tbx_sem_rastreio).toBe(1);
    expect(out.operadores[0].tbx_pct_entregue).toBe(50);
    expect(out.dashboard.tbx_n).toBe(2);
  });
});
