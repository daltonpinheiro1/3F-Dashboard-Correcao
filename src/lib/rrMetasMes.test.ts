import { afterEach, describe, expect, it, vi } from 'vitest';
import { mesesDaJanela, metasVendasDeRows, resolverMetasPorMes } from './rrMetasMes';

afterEach(() => vi.unstubAllGlobals());

const rows = [
  { campanha_op: 'PORTABILIDADE', cpc_pct: 60, vendas_mes: 4000, expediente_horas: 8 },
  { campanha_op: 'MIGRACAO', cpc_pct: 60, vendas_mes: 2000, expediente_horas: 8 },
];

describe('rrMetasMes', () => {
  it('lista competências da janela', () => {
    expect(mesesDaJanela('2026-08-25', '2026-10-02')).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(mesesDaJanela('2026-10-01', '2026-10-14')).toEqual(['2026-10']);
  });

  it('Todas = Port+Mig; exige as duas; campanha sem linha → null', () => {
    expect(metasVendasDeRows(rows, 'TODAS')).toEqual({ port: 4000, mig: 2000, campanha: 6000 });
    expect(metasVendasDeRows(rows.slice(0, 1), 'TODAS')).toBeNull();
    expect(metasVendasDeRows(rows, 'ACAO_BKO')).toBeNull();
    expect(metasVendasDeRows([], 'PORTABILIDADE')).toBeNull();
  });

  it('mês vigente usa store; mês passado usa a própria meta; sem cadastro sinaliza', () => {
    const r = resolverMetasPorMes({
      mesVigente: '2026-10',
      vigente: { port: 5000, mig: 5000, campanha: 10000 },
      meses: ['2026-08', '2026-09', '2026-10'],
      porMes: { '2026-09': { port: 4000, mig: 2000, campanha: 6000 }, '2026-08': null },
    });
    expect(r.campanha('2026-10')).toBe(10000);
    expect(r.campanha('2026-09')).toBe(6000);
    expect(r.port('2026-09')).toBe(4000);
    expect(r.campanha('2026-08')).toBe(10000);
    expect(r.mesesSemMeta).toEqual(['2026-08']);
  });

  it('mês ainda carregando (undefined) não é sinalizado como sem meta', () => {
    const r = resolverMetasPorMes({
      mesVigente: '2026-10',
      vigente: { port: 1, mig: 1, campanha: 2 },
      meses: ['2026-09', '2026-10'],
      porMes: {},
    });
    expect(r.mesesSemMeta).toEqual([]);
  });
});
