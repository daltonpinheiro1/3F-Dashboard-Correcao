import { describe, expect, it } from 'vitest';
import { mergeDiscagens, mergeTmaHoraPayload } from '../pages/DiscagensPage';
import type { EvaJornada, EvaPayload, SupervisorResumo } from './evaDash';
import { aplicarUsuariosUnicosPorDia, listarDiasHistoricos } from './evaPagesHistorical';

describe('agregação histórica das páginas EVA', () => {
  it('não trunca intervalos maiores que 31 dias (lista completa)', () => {
    const dias = listarDiasHistoricos('2026-07-01', '2026-08-09');
    expect(dias).toHaveLength(40);
    expect(dias[0]).toBe('2026-07-01');
    expect(dias[dias.length - 1]).toBe('2026-08-09');
  });

  it('opcionalmente recorta os 31 dias mais recentes', () => {
    const dias = listarDiasHistoricos('2026-07-01', '2026-08-09', { max: 31 });
    expect(dias).toHaveLength(31);
    expect(dias[0]).toBe('2026-07-10');
    expect(dias[dias.length - 1]).toBe('2026-08-09');
  });

  it('conta o mesmo usuário uma vez por dia e preserva os totais', () => {
    const supervisor = {
      supervisor: 'Sup',
      operadores: 1,
      logados: 1,
      tabuladas: 30,
    } as SupervisorResumo;
    const base = {
      id_user: 1,
      login: 'op1',
      user_name: 'Operador',
      supervisor_name: 'Sup',
    } as EvaJornada;
    const jornada = [
      { ...base, date_report: '2026-08-01', campaign_name: 'Migração' },
      { ...base, date_report: '2026-08-01', campaign_name: 'Portabilidade' },
      { ...base, date_report: '2026-08-02', campaign_name: 'Migração' },
    ];

    const [resultado] = aplicarUsuariosUnicosPorDia([supervisor], jornada);
    expect(resultado.operadores).toBe(2);
    expect(resultado.logados).toBe(2);
    expect(resultado.tabuladas).toBe(30);
  });

  it('soma volumes e recalcula taxas, usuários-dia e TMA ponderado', () => {
    const dia = (
      dialed: number,
      contact: number,
      operadores: number,
      tma: number,
      n: number,
    ) =>
      ({
        jornada: [],
        discagens: {
          fonte: 'mailing_dial_details',
          kpis: {
            dialed,
            contact,
            tabuladas: contact,
            cpc: contact / 2,
            sucesso: contact / 4,
            contact_rate: 0,
            cpc_rate: 0,
            efficacy: 0,
          },
          por_fila: [
            {
              queue_name: 'Fila Migração',
              campanha_op: 'MIGRACAO',
              operadores,
              dialed,
              contact,
              tabuladas: contact,
              cpc: contact / 2,
              sucesso: contact / 4,
              contact_rate: 0,
              cpc_rate: 0,
              efficacy: 0,
            },
          ],
        },
        tma_hora: [
          { nome: 'Venda', campanha_op: 'MIGRACAO', hora: 10, tma_seg: tma, n },
        ],
      }) as unknown as EvaPayload;

    const historico = [dia(100, 10, 2, 30, 10), dia(300, 60, 3, 90, 30)];
    const consolidado = mergeDiscagens(historico);
    const [tma] = mergeTmaHoraPayload(historico);

    expect(consolidado.kpis.dialed).toBe(400);
    expect(consolidado.kpis.contact).toBe(70);
    expect(consolidado.kpis.contact_rate).toBe(17.5);
    expect(consolidado.por_fila?.[0].operadores).toBe(5);
    expect(tma.tma_seg).toBe(75);
    expect(tma.n).toBe(40);
  });
});
