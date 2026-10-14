import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarUniverso, paginacaoFatia, universoDaMeta } from './portabilidade-funil';

afterEach(() => vi.unstubAllGlobals());

describe('paginacaoFatia', () => {
  it('export sem limit traz a fatia inteira (não corta em 80)', () => {
    expect(paginacaoFatia(new URLSearchParams('fatia=bko&export=1'))).toEqual({
      exportAll: true,
      limit: 5000,
      offset: 0,
    });
  });

  it('página padrão 80, teto 200 e limit inválido não zera a página', () => {
    expect(paginacaoFatia(new URLSearchParams('fatia=bko')).limit).toBe(80);
    expect(paginacaoFatia(new URLSearchParams('fatia=bko&limit=999')).limit).toBe(200);
    expect(paginacaoFatia(new URLSearchParams('fatia=bko&limit=abc')).limit).toBe(80);
    expect(paginacaoFatia(new URLSearchParams('fatia=bko&offset=-5')).offset).toBe(0);
  });
});

describe('universoDaMeta', () => {
  it('coorte congelada manda no denominador da meta', () => {
    expect(universoDaMeta({ universo_cohort: 7000 }, 5200)).toBe(7000);
  });

  it('sem coorte usa o universo vivo', () => {
    expect(universoDaMeta({}, 5200)).toBe(5200);
    expect(universoDaMeta(undefined, 5200)).toBe(5200);
    expect(universoDaMeta({ universo_cohort: 0 }, 5200)).toBe(5200);
  });
});

describe('montarUniverso · funil_pontes', () => {
  it('base_tim (fechado sem ticket) não reduz "ticket não fechado"', async () => {
    const ce = [
      {
        proposta_isize: '3F-100001',
        order_number: '1-1',
        order_status: 'Concluído',
        ticket_status: 'Portado',
        ultimo_retorno_em: '2026-09-10T12:00:00+00:00',
        enviada_em: '2026-09-01T12:00:00+00:00',
      },
      {
        proposta_isize: '3F-100002',
        order_number: '1-2',
        order_status: 'Concluído',
        ticket_status: null,
        ultimo_retorno_em: '2026-09-11T12:00:00+00:00',
        enviada_em: '2026-09-02T12:00:00+00:00',
      },
      {
        proposta_isize: '3F-100003',
        order_number: '1-3',
        order_status: 'Pendente Portabilidade',
        ticket_status: 'Conflito',
        ultimo_retorno_em: '2026-09-12T12:00:00+00:00',
        enviada_em: '2026-09-03T12:00:00+00:00',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        Response.json(String(input).includes('consultas_enviadas_pos_aceite') ? ce : []),
      ),
    );

    const built = await montarUniverso(
      { url: 'https://port.test', key: 'k' },
      { mes: '2026-09', modo: 'operacional' },
    );

    expect(built.reconciliacao.universo).toBe(3);
    expect(built.gerencial.com_ticket).toBe(2);
    expect(built.gerencial.fechados).toBe(2);
    expect(built.funil_pontes.ticket_nao_fechado).toBe(1);
  });

  it('separa fechados_tim de base_tim; conversão usa P+F+C e exclusivo soma o universo', async () => {
    const ce = [
      { proposta_isize: '3F-1', order_number: '1-1', order_status: 'Concluído', ticket_status: 'Portado', ultimo_retorno_em: '2026-09-10T12:00:00+00:00' },
      { proposta_isize: '3F-2', order_number: '1-2', order_status: 'Concluído', ticket_status: 'Portabilidade Cancelada', ultimo_retorno_em: '2026-09-10T12:00:00+00:00' },
      { proposta_isize: '3F-3', order_number: '1-3', order_status: 'Concluído', ticket_status: null, ultimo_retorno_em: '2026-09-11T12:00:00+00:00' },
      { proposta_isize: '3F-4', order_number: '1-4', order_status: 'Pendente Portabilidade', ticket_status: 'Conflito', ultimo_retorno_em: '2026-09-12T12:00:00+00:00' },
    ];
    const ag = [{ proposta_isize: '3F-5', status: 'quebra_logistica', updated_at: '2026-09-15T12:00:00+00:00' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input).replace(/\+/g, ' '));
        if (url.includes('consultas_enviadas_pos_aceite')) {
          if (url.includes('ticket_status=eq.Portabilidade Cancelada')) return Response.json([ce[1]]);
          return Response.json(url.includes('ticket_status=eq.') ? [] : ce);
        }
        if (url.includes('aguardando_entrega')) return Response.json(ag);
        return Response.json([]);
      }),
    );

    const built = await montarUniverso(
      { url: 'https://port.test', key: 'k' },
      { mes: '2026-09', modo: 'operacional' },
    );
    const u = built.reconciliacao.universo;
    expect(u).toBe(5);
    expect(built.gerencial.fechados).toBe(3);
    expect(built.gerencial.fechados_tim).toBe(2);
    expect(built.gerencial.base_tim).toBe(1);
    expect(built.reconciliacao.em_voo).toBe(1);
    expect(built.reconciliacao.quebras).toBe(1);

    const etapa = built.funil_conversao.find((e) => e.id === 'fechados')!;
    expect(etapa.valor).toBe(2);
    expect(etapa.label).toContain('c/ ticket');
    const comTicket = built.funil_conversao.find((e) => e.id === 'com_ticket')!;
    expect(etapa.valor).toBeLessThanOrEqual(comTicket.valor);

    expect(built.funil_exclusivo.reduce((a, e) => a + e.valor, 0)).toBe(u);
    expect(built.funil_pontes.base_tim).toBe(1);
    // ce_periodo 4 + ce_canceladas 1 + ce_abertas 4
    expect(built.reconciliacao.cobertura_cap.ce_lidas).toBe(9);
  });
});
