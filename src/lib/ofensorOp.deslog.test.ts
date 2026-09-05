import { describe, expect, it } from 'vitest';
import {
  ajustarDeslogueOperacional,
  buildUltimaAtividadePorLogin,
  derivarEntrada,
  fundirJornada,
  listarOfensores,
  tempoDeslogueEfetivo,
} from './ofensorOp';
import type { EvaChamada, EvaJornada } from './evaDash';

const baseJornada = (): EvaJornada => ({
  id_user: 1,
  user_name: 'Op Teste',
  login: 'op.teste',
  supervisor_name: 'Sup',
  campaign_name: 'Port',
  date_login: '2026-08-24T09:00:00',
  date_logout: null,
  logins: 1,
  logged_time: 3600,
  paused_time: 0,
  relogins: 0,
  keep_alive_abertos: 1,
  tempo_perdido_seg: 300,
  deslogs: [
    {
      logout: '2026-08-24T12:20:00',
      relogin: null,
      seg: 300,
      status: 'aberto',
    },
  ],
});

describe('ajustarDeslogueOperacional', () => {
  it('mantém relogin fechado', () => {
    const j: EvaJornada = {
      ...baseJornada(),
      relogins: 1,
      keep_alive_abertos: 0,
      deslogs: [
        {
          logout: '2026-08-24T10:00:00',
          relogin: '2026-08-24T10:01:00',
          seg: 60,
          status: 'fechado',
        },
      ],
      tempo_perdido_seg: 60,
    };
    const out = ajustarDeslogueOperacional(j);
    expect(out.relogins).toBe(1);
    expect(out.keep_alive_abertos).toBe(0);
  });

  it('suprime KA aberto com tabulação recente após keep_alive', () => {
    const j = baseJornada();
    const out = ajustarDeslogueOperacional(j, {
      ultimaAtividadeMs: new Date('2026-08-24T12:28:00-03:00').getTime(),
      agoraMs: new Date('2026-08-24T12:30:00-03:00').getTime(),
    });
    expect(out.keep_alive_abertos).toBe(0);
    expect(out.desconexoes).toBe(0);
    expect(tempoDeslogueEfetivo(out)).toBe(0);
    expect(out.deslogs?.every((d) => d.status === 'fechado' || d.relogin)).toBe(true);
  });

  it('suprime KA quando estado ao vivo não é instável', () => {
    const j = baseJornada();
    const out = ajustarDeslogueOperacional(j, { estadoAtivo: 'atendimento' });
    expect(out.keep_alive_abertos).toBe(0);
  });

  it('mantém KA quando sem atividade e instável', () => {
    const j = baseJornada();
    const out = ajustarDeslogueOperacional(j, {
      estadoAtivo: 'instavel',
      agoraMs: new Date('2026-08-24T12:30:00-03:00').getTime(),
    });
    expect(out.keep_alive_abertos).toBe(1);
    expect(tempoDeslogueEfetivo(out)).toBe(300);
  });

  it('não usa tabulação de outro dia BRT para suprimir KA do histórico', () => {
    const j = baseJornada();
    const out = ajustarDeslogueOperacional(j, {
      ultimaAtividadeMs: new Date('2026-08-25T09:00:00-03:00').getTime(),
      agoraMs: new Date('2026-08-25T09:01:00-03:00').getTime(),
      diaIso: '2026-08-24',
    });
    expect(out.keep_alive_abertos).toBe(1);
    expect(tempoDeslogueEfetivo(out)).toBe(300);
  });

  it('suprime KA com atividade do mesmo dia BRT', () => {
    const j = baseJornada();
    const out = ajustarDeslogueOperacional(j, {
      ultimaAtividadeMs: new Date('2026-08-24T12:28:00-03:00').getTime(),
      agoraMs: new Date('2026-08-24T12:30:00-03:00').getTime(),
      diaIso: '2026-08-24',
    });
    expect(out.keep_alive_abertos).toBe(0);
  });
});

describe('buildUltimaAtividadePorLogin', () => {
  it('pega última chamada por login', () => {
    const chamadas: EvaChamada[] = [
      {
        id: 1,
        login: 'op1',
        user_name: 'Op',
        supervisor_name: 'S',
        campaign_name: 'P',
        classification_name: 'Venda',
        contact: true,
        cpc: true,
        success: true,
        refusal: false,
        call_date: '2026-08-24',
        call_time: '10:00:00',
        area_code: 11,
        phone_number: '999',
      },
      {
        id: 2,
        login: 'op1',
        user_name: 'Op',
        supervisor_name: 'S',
        campaign_name: 'P',
        classification_name: 'Venda',
        contact: true,
        cpc: true,
        success: true,
        refusal: false,
        call_date: '2026-08-24',
        call_time: '12:28:00',
        area_code: 11,
        phone_number: '999',
      },
    ];
    const m = buildUltimaAtividadePorLogin(chamadas);
    expect(m.get('op1')).toBe(new Date('2026-08-24T12:28:00-03:00').getTime());
  });
});

describe('derivarEntrada BRT', () => {
  it('09:05 BRT é atraso de manhã (não depende do fuso do browser)', () => {
    const r = derivarEntrada('2026-08-24T09:05:00');
    expect(r.turno).toBe('manha');
    expect(r.meta).toBe('09:00');
    expect(r.atrasoSeg).toBe(300);
  });

  it('14:30 BRT é tarde sem atraso', () => {
    const r = derivarEntrada('2026-08-24T14:30:00');
    expect(r.turno).toBe('tarde');
    expect(r.meta).toBe('15:00');
    expect(r.atrasoSeg).toBe(0);
  });
});

describe('fundirJornada', () => {
  it('TMA vira média ponderada por chamadas', () => {
    const a = { ...baseJornada(), keep_alive_abertos: 0, deslogs: [], chamadas: 10, tma_seg: 60 };
    const b = { ...baseJornada(), keep_alive_abertos: 0, deslogs: [], chamadas: 30, tma_seg: 120 };
    const fused = fundirJornada([a, b]);
    expect(fused?.tma_seg).toBe(105);
    expect(fused?.chamadas).toBe(40);
  });
});

describe('listarOfensores hist', () => {
  it('mantém 1 card por login e conta dias ofensor', () => {
    const dia = (date: string, atraso: number): EvaJornada => ({
      ...baseJornada(),
      keep_alive_abertos: 0,
      deslogs: [],
      tempo_perdido_seg: 0,
      date_report: date,
      date_login: `${date}T09:10:00`,
      primeiro_login: `${date}T09:10:00`,
      atraso_entrada_seg: atraso,
    });
    const list = listarOfensores([dia('2026-08-24', 600), dia('2026-08-25', 120)]);
    expect(list).toHaveLength(1);
    expect(list[0].diasOfensor).toBe(2);
    expect(list[0].piorDia).toBe('2026-08-24');
  });
});
