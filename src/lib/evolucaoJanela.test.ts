import { describe, expect, it } from 'vitest';
import {
  agregarDiasEvolucao,
  contarSms,
  smsPorDiaSemRobo,
  janelasEvolucao,
  smsDiaVazio,
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

  it('conta SMS com sucesso, insucesso e aguardando exclusivos e ignora sem informação', () => {
    const rows = [
      { sms_previo: true, classificacao: 'insucesso', ticket_status: 'Portado' },
      { sms_previo: true, classificacao: 'insucesso', ticket_status: null },
      { sms_previo: true, classificacao: 'aguardando', ticket_status: null },
      { sms_previo: false, classificacao: 'sucesso', ticket_status: null },
      { sms_previo: false, classificacao: 'sem_retorno', order_status: 'Concluído' },
      { sms_previo: null, classificacao: 'sucesso' },
    ];
    const c = rows.reduce(contarSms, smsDiaVazio());
    expect(c).toEqual({ com: 3, sem: 2, suc_com: 1, suc_sem: 2, ins_com: 1, ins_sem: 0, agd_com: 1, agd_sem: 0 });
    expect(c.suc_com + c.ins_com + c.agd_com).toBeLessThanOrEqual(c.com);
  });

  it('soma SMS de todos os dias', () => {
    const dia = { com: 1, sem: 2, suc_com: 1, suc_sem: 0, ins_com: 0, ins_sem: 1, agd_com: 0, agd_sem: 1 };
    const dias = Array.from({ length: 20 }, () => dia);
    expect(somarSmsDias(dias)).toEqual({ com: 20, sem: 40, suc_com: 20, suc_sem: 0, ins_com: 0, ins_sem: 20, agd_com: 0, agd_sem: 20 });
  });

  it('tempo médio do dia ignora passagens do Roboadm', () => {
    const robo = (v: string | null | undefined) => /^roboadm\d*$/i.test(String(v || '').trim());
    const passagens = [
      { proposta_id: '1', data_venda: '2026-10-01T00:00:00Z', vendedor: 'Ana', tipos_erro: ['cep_incorreto'], elapsed_ms: 100 },
      { proposta_id: '1', data_venda: '2026-10-01T00:00:00Z', vendedor: 'Roboadm1', tipos_erro: [], elapsed_ms: 50_000 },
      { proposta_id: '2', data_venda: '2026-10-01T00:00:00Z', vendedor: 'Bia', tipos_erro: [], elapsed_ms: 300 },
      { proposta_id: '3', data_venda: '2026-10-02T00:00:00Z', vendedor: 'Roboadm1', tipos_erro: [], elapsed_ms: 50_000 },
    ];
    const propostas = passagens.filter((p) => p.proposta_id !== '3' && p.vendedor !== 'Roboadm1');
    const dias = agregarDiasEvolucao(passagens, propostas, robo, (t) => t.length > 0);
    expect(dias).toEqual([{
      dia: '2026-10-01', total_propostas: 2, total_corrigidas: 1, taxa_erro_pct: 50, tempo_medio_ms: 200, vendedores_ativos: 2,
    }]);
  });

  it('SMS por dia exclui o Roboadm e linhas sem info', () => {
    const robo = (v: string | null | undefined) => /^roboadm\d*$/i.test(String(v || '').trim());
    const dias = smsPorDiaSemRobo([
      { vendedor: 'Ana', data_venda: '2026-10-01T00:00:00Z', sms_previo: true, ticket_status: 'portado' },
      { vendedor: 'Roboadm2', data_venda: '2026-10-01T00:00:00Z', sms_previo: true, ticket_status: 'portado' },
      { vendedor: 'Bia', data_venda: '2026-10-01T00:00:00Z', sms_previo: null },
      { vendedor: 'Bia', data_venda: '2026-10-02T00:00:00Z', sms_previo: false, classificacao: 'insucesso' },
    ], robo);
    expect(dias['2026-10-01']).toMatchObject({ com: 1, sem: 0, suc_com: 1 });
    expect(dias['2026-10-02']).toMatchObject({ com: 0, sem: 1, ins_sem: 1 });
  });
});
