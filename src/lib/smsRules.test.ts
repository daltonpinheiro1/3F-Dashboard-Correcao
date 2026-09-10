import { describe, expect, it } from 'vitest';
import {
  brtRangeIso,
  dedupeSmsPorProposta,
  hasSmsInfo,
  isAguardando,
  isComSms,
  isPortadoComBilhete,
  isPortadoConsolidado,
  isSemSms,
  isTicketSucesso,
  smsDataVendaBounds,
  startOfTodayBrtIso,
  TICKETS_SUCESSO,
  buildSmsSerieDiaria,
  eachIsoDayInclusive,
} from './smsRules';
import { isPortadoConsolidado as isPortadoConsolidadoServer } from '../../functions/_lib/rrKpis';

describe('isTicketSucesso', () => {
  it('aceita tickets alinhados ao sync (STATUS_SUCESSO)', () => {
    for (const t of TICKETS_SUCESSO) {
      expect(isTicketSucesso(t)).toBe(true);
      expect(isTicketSucesso(t.toUpperCase())).toBe(true);
    }
  });

  it('aceita variações TIM (Portado TIM, Falha Parcial …)', () => {
    expect(isTicketSucesso('Portado TIM')).toBe(true);
    expect(isTicketSucesso('Falha Parcial - chip')).toBe(true);
    expect(isTicketSucesso('Portabilidade Cancelada')).toBe(false);
    expect(isTicketSucesso('Portabilidade Pendente')).toBe(false);
    expect(isTicketSucesso('não portado')).toBe(false);
    expect(isTicketSucesso('Nao Portado TIM')).toBe(false);
    expect(isTicketSucesso('')).toBe(false);
    expect(isTicketSucesso(null)).toBe(false);
  });
});

describe('isPortadoComBilhete', () => {
  it('só conta ticket de sucesso, não OS Concluído vazio', () => {
    expect(isPortadoComBilhete({ ticket_status: 'Portado' })).toBe(true);
    expect(isPortadoComBilhete({ ticket_status: 'Falha Parcial' })).toBe(true);
    expect(
      isPortadoComBilhete({ ticket_status: null }),
    ).toBe(false);
    expect(isPortadoComBilhete({ ticket_status: 'Portabilidade Cancelada' })).toBe(false);
  });
});

describe('isPortadoConsolidado', () => {
  it('prioriza classificacao sucesso', () => {
    expect(isPortadoConsolidado({ classificacao: 'sucesso', ticket_status: null })).toBe(true);
  });

  it('usa ticket quando classificacao não é sucesso', () => {
    expect(isPortadoConsolidado({ classificacao: 'aguardando', ticket_status: 'Portado' })).toBe(
      true,
    );
    expect(
      isPortadoConsolidado({ classificacao: 'aguardando', ticket_status: 'Falha Parcial' }),
    ).toBe(true);
  });

  it('não confunde insucesso sem ticket de sucesso', () => {
    expect(isPortadoConsolidado({ classificacao: 'insucesso', ticket_status: 'Conflito' })).toBe(
      false,
    );
  });

  it("OS Concluído sem ticket conta como portado (corte TIM ~18/08)", () => {
    expect(
      isPortadoConsolidado({
        classificacao: "aguardando",
        ticket_status: null,
        order_status: "Concluído",
      }),
    ).toBe(true);
    expect(
      isPortadoConsolidado({
        classificacao: "aguardando",
        ticket_status: "Portabilidade Pendente",
        order_status: "Concluído",
      }),
    ).toBe(false);
    expect(
      isPortadoConsolidado({
        classificacao: "aguardando",
        ticket_status: "Portabilidade Cancelada",
        order_status: "Concluído",
      }),
    ).toBe(false);
    expect(
      isPortadoConsolidado({
        classificacao: "aguardando",
        ticket_status: "Em Análise TIM",
        order_status: "Concluído",
      }),
    ).toBe(false);
  });

  it('mantém a mesma matriz no cliente e no servidor, com bloqueio antes de sucesso', () => {
    const casos = [
      { row: { classificacao: 'sucesso', ticket_status: 'Portabilidade Cancelada', order_status: 'Concluído' }, esperado: false },
      { row: { classificacao: 'sucesso', ticket_status: 'Pendente', order_status: null }, esperado: false },
      { row: { classificacao: 'sucesso', ticket_status: null, order_status: null }, esperado: true },
      { row: { classificacao: 'insucesso', ticket_status: 'Portado TIM', order_status: null }, esperado: true },
      { row: { classificacao: 'aguardando', ticket_status: null, order_status: 'Completed' }, esperado: true },
      { row: { classificacao: 'sucesso', ticket_status: 'Em análise TIM', order_status: 'Concluído' }, esperado: false },
    ];
    for (const { row, esperado } of casos) {
      expect(isPortadoConsolidado(row)).toBe(esperado);
      expect(isPortadoConsolidadoServer(row)).toBe(esperado);
      expect(isPortadoConsolidadoServer(row)).toBe(isPortadoConsolidado(row));
    }
  });
});

describe('sms previo helpers', () => {
  it('hasSmsInfo só true/false', () => {
    expect(hasSmsInfo(true)).toBe(true);
    expect(hasSmsInfo(false)).toBe(true);
    expect(hasSmsInfo(null)).toBe(false);
    expect(hasSmsInfo(undefined)).toBe(false);
  });

  it('isComSms / isSemSms', () => {
    expect(isComSms(true)).toBe(true);
    expect(isSemSms(false)).toBe(true);
    expect(isComSms(false)).toBe(false);
    expect(isSemSms(null)).toBe(false);
  });
});

describe('isAguardando', () => {
  it('reconhece aguardando e sem_retorno', () => {
    expect(isAguardando('aguardando')).toBe(true);
    expect(isAguardando('sem_retorno')).toBe(true);
    expect(isAguardando('insucesso')).toBe(false);
  });
});

describe('startOfTodayBrtIso', () => {
  it('retorna ISO UTC do início do dia BRT (03:00Z)', () => {
    const iso = startOfTodayBrtIso();
    expect(iso).toMatch(/T03:00:00\.000Z$/);
  });
});

describe('coerência COM + SEM + sem info', () => {
  const rows = [
    { classificacao: 'sucesso', sms_previo: true as boolean | null },
    { classificacao: 'sucesso', sms_previo: false },
    { classificacao: 'sucesso', sms_previo: null },
    { classificacao: 'aguardando', sms_previo: true },
  ];

  it('total portados = com + sem + sem info SMS', () => {
    const total = rows.filter(isPortadoConsolidado).length;
    const comInfo = rows.filter((r) => hasSmsInfo(r.sms_previo));
    const com = comInfo.filter((r) => isComSms(r.sms_previo) && isPortadoConsolidado(r)).length;
    const sem = comInfo.filter((r) => isSemSms(r.sms_previo) && isPortadoConsolidado(r)).length;
    const semInfo = rows.filter(
      (r) => isPortadoConsolidado(r) && !hasSmsInfo(r.sms_previo),
    ).length;
    expect(com + sem + semInfo).toBe(total);
    expect(total).toBe(3);
    expect(semInfo).toBe(1);
  });
});

describe('brtRangeIso', () => {
  it('usa offset BRT no início e fim do dia', () => {
    expect(brtRangeIso('2026-09-03', '2026-09-03')).toEqual({
      gte: '2026-09-03T00:00:00.000-03:00',
      lte: '2026-09-03T23:59:59.999-03:00',
    });
  });
});

describe('smsDataVendaBounds', () => {
  it('filtra o dia UTC inteiro, sem offset BRT no data_venda', () => {
    expect(smsDataVendaBounds('2026-09-01', '2026-09-08')).toEqual({
      gte: '2026-09-01T00:00:00.000Z',
      lte: '2026-09-08T23:59:59.999Z',
    });
    expect(smsDataVendaBounds('2026-09-01T00:00:00-03:00', '2026-09-08T23:59:59.999')).toEqual({
      gte: '2026-09-01T00:00:00.000Z',
      lte: '2026-09-08T23:59:59.999Z',
    });
    expect(smsDataVendaBounds('', '')).toEqual({});
  });
});

describe('dedupeSmsPorProposta', () => {
  it('mantém a linha portada quando há duplicata', () => {
    const rows = [
      { proposta_id: '1', classificacao: 'aguardando', ticket_status: null, retorno_atualizado_em: 'a' },
      { proposta_id: '1', classificacao: 'sucesso', ticket_status: 'Portado', retorno_atualizado_em: 'b' },
      { proposta_id: '2', classificacao: 'sucesso', ticket_status: 'Portado', retorno_atualizado_em: 'c' },
    ];
    const uniq = dedupeSmsPorProposta(rows);
    expect(uniq).toHaveLength(2);
    expect(uniq.filter(isPortadoConsolidado)).toHaveLength(2);
  });

  it('não conserva portado antigo se o retorno mais recente cancelou', () => {
    const uniq = dedupeSmsPorProposta([
      { proposta_id: '1', classificacao: 'sucesso', ticket_status: 'Portado', retorno_atualizado_em: '2026-09-01' },
      { proposta_id: '1', classificacao: 'insucesso', ticket_status: 'Portabilidade Cancelada', retorno_atualizado_em: '2026-09-03' },
    ]);
    expect(uniq).toHaveLength(1);
    expect(isPortadoConsolidado(uniq[0])).toBe(false);
  });
});

describe('buildSmsSerieDiaria', () => {
  it('preenche domingo sem venda para não interpolar COM/SEM', () => {
    const serie = buildSmsSerieDiaria(
      [
        {
          data_venda: '2026-09-05T00:00:00+00:00',
          classificacao: 'insucesso',
          ticket_status: 'Conflito',
          sms_previo: false,
        },
        {
          data_venda: '2026-09-07T00:00:00+00:00',
          classificacao: 'sucesso',
          ticket_status: 'Portado',
          order_status: 'Concluído',
          sms_previo: true,
        },
        {
          data_venda: '2026-09-07T00:00:00+00:00',
          classificacao: 'sucesso',
          ticket_status: null,
          order_status: 'Concluído',
          sms_previo: true,
        },
      ],
      '2026-09-05',
      '2026-09-07',
    );
    expect(eachIsoDayInclusive('2026-09-05', '2026-09-07')).toEqual([
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
    expect(serie.map((d) => d.dia)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(serie[1]).toMatchObject({ total: 0, portados: 0, taxaCom: 0, taxaSem: 0 });
    expect(serie[2].portados).toBe(2);
    expect(serie[2].comSms).toBe(2);
    expect(serie[2].taxaCom).toBe(100);
  });

  it('OS Concluído sem ticket conta no COM/SEM; cancelado não', () => {
    const serie = buildSmsSerieDiaria(
      [
        {
          data_venda: '2026-09-08T00:00:00+00:00',
          classificacao: 'aguardando',
          ticket_status: null,
          order_status: 'Concluído',
          sms_previo: true,
        },
        {
          data_venda: '2026-09-08T00:00:00+00:00',
          classificacao: 'sucesso',
          ticket_status: 'Falha Parcial',
          sms_previo: false,
        },
        {
          data_venda: '2026-09-08T00:00:00+00:00',
          classificacao: 'insucesso',
          ticket_status: 'Portabilidade Cancelada',
          order_status: 'Concluído',
          sms_previo: true,
        },
      ],
      '2026-09-08',
      '2026-09-08',
    );
    expect(serie[0].portados).toBe(2);
    expect(serie[0].sucCom).toBe(1);
    expect(serie[0].sucSem).toBe(1);
  });
});
