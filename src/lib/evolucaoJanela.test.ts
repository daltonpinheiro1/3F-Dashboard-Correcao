import { describe, expect, it } from 'vitest';
import {
  janelasEvolucao,
  restringirAoUniverso,
  resumoJanela,
  somarSmsDias,
  tendenciaPct,
} from './evolucaoJanela';

describe('evolucaoJanela', () => {
  it('monta janela atual e anterior do mesmo tamanho', () => {
    expect(janelasEvolucao('2026-09-28', 7)).toEqual({
      atual: { de: '2026-09-22', ate: '2026-09-28' },
      anterior: { de: '2026-09-15', ate: '2026-09-21' },
    });
    const j30 = janelasEvolucao('2026-03-01', 30);
    expect(j30.atual).toEqual({ de: '2026-01-31', ate: '2026-03-01' });
    expect(j30.anterior).toEqual({ de: '2026-01-01', ate: '2026-01-30' });
  });

  it('resume a janela com taxa ponderada e média por dia com venda', () => {
    const dados = [
      { dia: '2026-09-28', total_propostas: 100, total_corrigidas: 10 },
      { dia: '2026-09-27', total_propostas: 10, total_corrigidas: 5 },
      { dia: '2026-09-20', total_propostas: 50, total_corrigidas: 25 },
    ];
    const { atual, anterior } = janelasEvolucao('2026-09-28', 7);
    const a = resumoJanela(dados, atual);
    expect(a.propostas).toBe(110);
    expect(a.erros).toBe(15);
    expect(a.taxaPct).toBeCloseTo(13.636, 2);
    expect(a.diasComDados).toBe(2);
    expect(a.mediaPorDia).toBe(55);
    const b = resumoJanela(dados, anterior);
    expect(b.propostas).toBe(50);
    expect(tendenciaPct(a, b)).toBeCloseTo(((15 / 110) * 100 - 50) / 50 * 100, 5);
  });

  it('tendência é null sem base anterior', () => {
    const vazio = resumoJanela([], { de: '2026-09-01', ate: '2026-09-07' });
    const cheio = resumoJanela([{ dia: '2026-09-02', total_propostas: 5, total_corrigidas: 1 }], { de: '2026-09-01', ate: '2026-09-07' });
    expect(tendenciaPct(cheio, vazio)).toBeNull();
  });

  it('restringe linhas Toutbox ao universo de propostas', () => {
    const rows = [{ proposta_id: 'a' }, { proposta_id: ' b ' }, { proposta_id: 'c' }, { proposta_id: null }];
    expect(restringirAoUniverso(rows, new Set(['a', 'b']))).toEqual([{ proposta_id: 'a' }, { proposta_id: ' b ' }]);
  });

  it('soma SMS de todos os dias', () => {
    const dia = { com: 1, sem: 2, suc_com: 1, suc_sem: 0, ins_com: 0, ins_sem: 1, agd_com: 0, agd_sem: 1 };
    const dias = Array.from({ length: 20 }, () => dia);
    expect(somarSmsDias(dias)).toEqual({ com: 20, sem: 40, suc_com: 20, suc_sem: 0, ins_com: 0, ins_sem: 20, agd_com: 0, agd_sem: 20 });
  });
});
