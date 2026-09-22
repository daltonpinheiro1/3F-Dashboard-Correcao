import { describe, expect, it } from 'vitest';
import { matchDiscRow } from '../../src/lib/discagensFiltro';
import { parseEvaSnapshot } from './eva';

/** Fixture do incidente 22/09: funil MIG no recorte sem stub só-BKO. */
const liveMig = {
  data: '2026-09-22',
  updated_at: '2026-09-22T09:31:09',
  kpis_operacao: { humanos_logados: 68 },
  kpis_chamadas: { tabuladas: 422, pct_cpc: 30.8 },
  discagens: {
    fonte: 'mailing_logger_attendance',
    kpis: { dialed: 125552, contact: 613, tabuladas: 312, cpc: 120 },
    por_campanha: [
      { campanha_op: 'PORTABILIDADE', dialed: 69773, contact: 10, tabuladas: 8 },
      { campanha_op: 'MIGRACAO', dialed: 16339, contact: 345, tabuladas: 238 },
    ],
    serie_hora: [
      { hora: '09', campanha_op: 'MIGRACAO', dialed: 16339, contact: 345, tabuladas: 238 },
    ],
    por_fila: [
      {
        queue_name: '07 - TIM PRE CONTROLE PREDITIVO',
        campanha_op: 'MIGRACAO',
        dialed: 12285,
        contact: 253,
        tabuladas: 238,
      },
    ],
    por_operador: [{ user_name: 'OP MIG', campanha_op: 'MIGRACAO', tabuladas: 20 }],
    tab_hora: [{ nome: 'ACEITOU', campanha_op: 'MIGRACAO', n: 10, hora: 9 }],
    serie_10min: [{ slot: '2026-09-22 09:20', campanha_op: 'MIGRACAO', dialed: 800 }],
  },
};

describe('contrato Discagens MIG', () => {
  it('parseEvaSnapshot aceita live com fatias MIG', () => {
    const parsed = parseEvaSnapshot(liveMig, { kind: 'live' });
    expect(parsed.ok).toBe(true);
  });

  it('recorte Migração Pré encontra fila, op e tab_hora', () => {
    const d = liveMig.discagens;
    expect(d.por_fila.filter((r) => matchDiscRow(r, 'MIGRACAO'))).toHaveLength(1);
    expect(d.por_operador.filter((r) => matchDiscRow(r, 'MIGRACAO'))).toHaveLength(1);
    expect(d.tab_hora.filter((r) => matchDiscRow(r, 'MIGRACAO'))).toHaveLength(1);
    expect(d.serie_hora.filter((r) => matchDiscRow(r, 'MIGRACAO'))[0].dialed).toBe(16339);
  });

  it('stub só-BKO não passa no recorte MIG', () => {
    const stubFila = [{ queue_name: 'AÇÃO BKO', campanha_op: 'ACAO_BKO', dialed: 236 }];
    expect(stubFila.filter((r) => matchDiscRow(r, 'MIGRACAO'))).toHaveLength(0);
  });
});
