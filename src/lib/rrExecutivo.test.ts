import { describe, expect, it } from 'vitest';
import { buildRrSnapshot, labelGapRitmo } from './rrExecutivo';
import type { EvaHoraSupervisor, EvaJornada, EvaSerieHora } from './evaDash';

const serie: EvaSerieHora[] = [
  { hora: '09', campanha_op: 'PORTABILIDADE', total: 100, cpc: 40, sucesso: 10, pct_cpc: 40 },
  { hora: '10', campanha_op: 'PORTABILIDADE', total: 100, cpc: 40, sucesso: 12, pct_cpc: 40 },
];

const horaSup: EvaHoraSupervisor[] = [
  { hora: '09', supervisor: 'Ana', campanha_op: 'PORTABILIDADE', total: 50, cpc: 20, sucesso: 6, pct_cpc: 40 },
  { hora: '10', supervisor: 'Ana', campanha_op: 'PORTABILIDADE', total: 50, cpc: 20, sucesso: 8, pct_cpc: 40 },
  { hora: '09', supervisor: 'Bruno', campanha_op: 'PORTABILIDADE', total: 50, cpc: 20, sucesso: 4, pct_cpc: 40 },
  { hora: '10', supervisor: 'Bruno', campanha_op: 'PORTABILIDADE', total: 50, cpc: 20, sucesso: 4, pct_cpc: 40 },
];

const jornada: EvaJornada[] = [
  {
    id_user: 1,
    user_name: 'Op A',
    login: 'opa',
    supervisor_name: 'Ana',
    campaign_name: 'Port',
    campanha_op: 'PORTABILIDADE',
    date_login: '2026-08-31T09:00:00',
    date_logout: null,
    logins: 1,
    logged_time: 3600,
    paused_time: 0,
    tabuladas: 20,
    cpc: 10,
    sucesso: 5,
  },
];

describe('buildRrSnapshot', () => {
  it('agrega vendas, meta e ranking por supervisor', () => {
    const snap = buildRrSnapshot({
      dataRef: '2026-08-31',
      campanha: 'PORTABILIDADE',
      horaAtual: '10',
      serie,
      horaSupervisor: horaSup,
      jornada,
      ativos: [],
      metaVendasMes: 5000,
      expedienteHoras: 8,
    });
    expect(snap.vendas).toBe(22);
    expect(snap.metaDia).toBeGreaterThan(0);
    expect(snap.supervisores.length).toBeGreaterThanOrEqual(2);
    expect(snap.supervisores[0].vendas).toBeGreaterThanOrEqual(
      snap.supervisores[snap.supervisores.length - 1]!.vendas,
    );
    expect(snap.destaques.length).toBeGreaterThan(0);
  });

  it('TODAS exclui BKO das vendas (meta é Port+Mig)', () => {
    const snap = buildRrSnapshot({
      dataRef: '2026-08-31',
      campanha: 'TODAS',
      horaAtual: '10',
      serie: [
        ...serie,
        { hora: '09', campanha_op: 'ACAO_BKO', total: 80, cpc: 20, sucesso: 40, pct_cpc: 25 },
        { hora: '10', campanha_op: 'ACAO_BKO', total: 80, cpc: 20, sucesso: 40, pct_cpc: 25 },
      ],
      horaSupervisor: horaSup,
      jornada,
      ativos: [
        {
          id: 1,
          id_user: 1,
          user_name: 'A',
          login: 'opa',
          supervisor_name: 'Ana',
          campaign_name: 'Port',
          campanha_op: 'PORTABILIDADE',
          date_login: null,
          last_keep_alive: null,
          estado: 'disponivel',
        },
        {
          id: 2,
          id_user: 2,
          user_name: 'B',
          login: 'bko',
          supervisor_name: 'Ana',
          campaign_name: 'BKO',
          campanha_op: 'ACAO_BKO',
          date_login: null,
          last_keep_alive: null,
          estado: 'disponivel',
        },
      ],
      metaVendasMes: 5000,
      expedienteHoras: 8,
    });
    expect(snap.vendas).toBe(22);
    expect(snap.logados).toBe(1);
  });
});

describe('labelGapRitmo', () => {
  it('positivo é acima do ritmo, não falta', () => {
    expect(labelGapRitmo(12).texto).toMatch(/Acima/);
    expect(labelGapRitmo(-8).texto).toMatch(/Abaixo/);
    expect(labelGapRitmo(0).texto).toBe('No ritmo');
  });
});
