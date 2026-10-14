import { describe, expect, it } from 'vitest';
import {
  agregarErroDia,
  agregarSmsDia,
  isPortadoComBilhete,
  isPortadoConsolidado,
  listaErroDia,
  listaGrossDia,
  pickSmsMaisRecente,
  sinceBrtDaysIso,
  startOfBrtDayIso,
  smsDataVendaIso,
} from './rrKpis';

describe('rrKpis lista', () => {
  it('Gross cap 80', () => {
    const rows = Array.from({ length: 85 }, (_, i) => ({ proposta_id: `p${i}` }));
    expect(listaGrossDia(rows)).toHaveLength(80);
  });

  it('erro consolida passagens por proposta e exclui robô (paridade com aggregateCorrecao)', () => {
    const r = agregarErroDia([
      { proposta_id: 'a', vendedor: 'Ana', tipos_erro: [] },
      { proposta_id: 'a', vendedor: 'roboadm', tipos_erro: ['cep'] },
      { proposta_id: 'b', vendedor: 'Bia', tipos_erro: ['referencia_tratamento'] },
      { proposta_id: 'c', vendedor: 'roboadm3', tipos_erro: ['cep'] },
    ]);
    expect(r).toEqual({ propostas: 2, comErro: 1, taxaErroPct: 50 });
  });

  it('listas do drill não trazem robô nem passagem repetida', () => {
    expect(listaGrossDia([{ proposta_id: 'x', vendedor: 'roboadm' }, { proposta_id: 'y', vendedor: 'Ana' }]))
      .toEqual([{ proposta_id: 'y', classificacao: null, ticket_status: null, vendedor: 'Ana' }]);
    expect(listaErroDia([
      { proposta_id: 'a', vendedor: 'Ana', tipos_erro: ['cep'] },
      { proposta_id: 'a', vendedor: 'Ana', tipos_erro: ['bairro'] },
    ])).toHaveLength(1);
  });

  it('erro só operacional', () => {
    expect(listaErroDia([{ tipos_erro: ['cep'], proposta_id: 'a' }])).toHaveLength(1);
    expect(listaErroDia([{ tipos_erro: ['referencia_tratamento'], proposta_id: 'a' }])).toHaveLength(0);
  });

  it('Portado TIM conta no consolidado', () => {
    const r = agregarSmsDia([
      { proposta_id: '1', classificacao: 'aguardando', ticket_status: 'Portado TIM' },
    ]);
    expect(r.portadosConsolidado).toBe(1);
  });

  it('Concluído sem ticket conta no consolidado mas NÃO é Portados hoje (só bilhete)', () => {
    const row = {
      proposta_id: '1',
      classificacao: 'aguardando',
      ticket_status: null,
      order_status: 'Concluído',
    };
    expect(isPortadoConsolidado(row)).toBe(true);
    expect(isPortadoComBilhete(row)).toBe(false);
    const r = agregarSmsDia([row]);
    expect(r.portadosConsolidado).toBe(1);
  });

  it('ticket bloqueador vence classificação sucesso e OS concluída', () => {
    expect(isPortadoConsolidado({
      classificacao: 'sucesso',
      ticket_status: 'Portabilidade Cancelada',
      order_status: 'Concluído',
    })).toBe(false);
    expect(isPortadoConsolidado({
      classificacao: 'sucesso',
      ticket_status: 'Pendente',
      order_status: null,
    })).toBe(false);
  });

  it('janela de N dias começa no calendário BRT', () => {
    const agora = new Date('2026-09-01T02:30:00.000Z'); // 23:30 BRT de 31/08
    expect(startOfBrtDayIso(agora)).toBe('2026-08-31T03:00:00.000Z');
    expect(sinceBrtDaysIso(1, agora)).toBe('2026-08-31T03:00:00.000Z');
    expect(sinceBrtDaysIso(2, agora)).toBe('2026-08-30T03:00:00.000Z');
  });

  it('data_venda do cubo SMS é dia UTC, sem BRT', () => {
    expect(smsDataVendaIso('2026-09-08')).toEqual({
      gte: '2026-09-08T00:00:00.000Z',
      lte: '2026-09-08T23:59:59.999Z',
    });
  });
});

describe('dedupe SMS = pickSmsMaisRecente (aba SMS)', () => {
  it('linha mais recente vence mesmo se a antiga era portada', () => {
    const r = agregarSmsDia([
      { proposta_id: 'A', ticket_status: 'Portado', retorno_atualizado_em: '2026-10-01T10:00:00Z' },
      { proposta_id: 'A', ticket_status: 'Pendente', retorno_atualizado_em: '2026-10-02T10:00:00Z' },
    ]);
    expect(r.vendasBrutas).toBe(1);
    expect(r.portadosConsolidado).toBe(0);
  });

  it('com retorno em uma só linha, ela vence; empate desempata por portado', () => {
    type L = { ticket_status: string | null; retorno_atualizado_em: string | null };
    const comRet: L = { ticket_status: null, retorno_atualizado_em: '2026-10-01T10:00:00Z' };
    const semRet: L = { ticket_status: 'Portado', retorno_atualizado_em: null };
    expect(pickSmsMaisRecente(semRet, comRet)).toBe(comRet);
    expect(pickSmsMaisRecente(comRet, semRet)).toBe(comRet);
    const a: L = { ticket_status: 'Portado', retorno_atualizado_em: 'x' };
    const b: L = { ticket_status: null, retorno_atualizado_em: 'x' };
    expect(pickSmsMaisRecente(a, b)).toBe(a);
  });
});
