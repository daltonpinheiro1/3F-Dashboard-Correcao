import { describe, expect, it } from 'vitest';
import { resolveDialCpcRr } from './rrDial';

describe('resolveDialCpcRr', () => {
  it('soma só Port+Mig em TODAS (exclui BKO)', () => {
    const r = resolveDialCpcRr({
      campanha: 'TODAS',
      porCampanha: [
        { campanha_op: 'PORTABILIDADE', dialed: 100, cpc: 10 },
        { campanha_op: 'MIGRACAO', dialed: 40, cpc: 4 },
        { campanha_op: 'ACAO_BKO', dialed: 999, cpc: 99 },
      ],
      jornadaCpc: 7,
    });
    expect(r.dialed).toBe(140);
    expect(r.cpc).toBe(14);
    expect(r.semFatia).toBe(false);
  });

  it('TODAS sem fatia não usa KPI global', () => {
    const r = resolveDialCpcRr({
      campanha: 'TODAS',
      porCampanha: [],
      jornadaCpc: 12,
    });
    expect(r.dialed).toBe(0);
    expect(r.cpc).toBe(12);
    expect(r.semFatia).toBe(true);
  });
});
