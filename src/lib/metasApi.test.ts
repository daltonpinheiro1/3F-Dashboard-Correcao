import { describe, expect, it } from 'vitest';
import { competenciaAtual, metasPayloadToStore } from './metasApi';

const current = {
  metaDia: 70,
  metaMes: 70,
  metasSup: { Ana: 72 },
  metaVendasMesPort: 5000,
  metaVendasMesMig: 3200,
  metaVendasMesBko: 1500,
  metaVendasMesCc: 1000,
  metaVendasMesAlgar: 600,
  expedienteHorasPort: 8,
  expedienteHorasMig: 8,
  expedienteHorasBko: 6,
  expedienteHorasCc: 8,
  expedienteHorasAlgar: 6,
};

describe('metasPayloadToStore', () => {
  it('mês sem metas mantém valores atuais', () => {
    const out = metasPayloadToStore({ competencia: '2026-10', campanhas: [], supervisores: [] }, current);
    expect(out).toEqual(current);
  });

  it('aplica campos presentes e preserva os ausentes', () => {
    const out = metasPayloadToStore(
      {
        competencia: '2026-10',
        competencia_origem: '2026-09',
        campanhas: [
          { campanha_op: 'TODAS', cpc_pct: 66, vendas_mes: 0, expediente_horas: 8 },
          { campanha_op: 'CONTROLE_CONTROLE', cpc_pct: 66, vendas_mes: 1200, expediente_horas: 7 },
        ],
        supervisores: [{ supervisor_name: 'Bia', cpc_pct: 68 }],
      },
      current,
    );
    expect(out.metaDia).toBe(66);
    expect(out.metaVendasMesCc).toBe(1200);
    expect(out.expedienteHorasCc).toBe(7);
    expect(out.metaVendasMesMig).toBe(3200);
    expect(out.metaVendasMesAlgar).toBe(600);
    expect(out.metasSup).toEqual({ Bia: 68 });
  });

  it('replaceSup limpa supervisores ao salvar lista vazia', () => {
    const out = metasPayloadToStore(
      { competencia: '2026-10', campanhas: [], supervisores: [] },
      current,
      { replaceSup: true },
    );
    expect(out.metasSup).toEqual({});
  });
});

describe('competenciaAtual', () => {
  it('usa o mês BRT (00:30Z do dia 1 ainda é o mês anterior)', () => {
    expect(competenciaAtual(new Date('2026-11-01T00:30:00Z'))).toBe('2026-10');
  });
});
