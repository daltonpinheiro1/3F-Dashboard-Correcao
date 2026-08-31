import { describe, expect, it } from 'vitest';
import {
  hasSmsInfo,
  isAguardando,
  isComSms,
  isPortadoConsolidado,
  isSemSms,
  isTicketSucesso,
  startOfTodayBrtIso,
  TICKETS_SUCESSO,
} from './smsRules';

describe('isTicketSucesso', () => {
  it('aceita tickets alinhados ao sync (STATUS_SUCESSO)', () => {
    for (const t of TICKETS_SUCESSO) {
      expect(isTicketSucesso(t)).toBe(true);
      expect(isTicketSucesso(t.toUpperCase())).toBe(true);
    }
  });

  it('rejeita tickets não consolidados', () => {
    expect(isTicketSucesso('Portabilidade Pendente')).toBe(false);
    expect(isTicketSucesso('Portabilidade Cancelada')).toBe(false);
    expect(isTicketSucesso('')).toBe(false);
    expect(isTicketSucesso(null)).toBe(false);
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
