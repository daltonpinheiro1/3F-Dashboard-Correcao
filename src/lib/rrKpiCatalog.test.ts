import { describe, expect, it } from 'vitest';
import { kpiFooter, RR_KPI_CATALOG } from './rrKpiCatalog';

describe('RR_KPI_CATALOG', () => {
  it('Gross é Port / dia / Operações', () => {
    expect(RR_KPI_CATALOG.gross_dia.universo).toBe('Portabilidade');
    expect(RR_KPI_CATALOG.gross_dia.janela).toBe('dia');
    expect(kpiFooter('eva_sucesso')).toMatch(/Port\+Mig/);
  });
});
