import { describe, expect, it } from 'vitest';
import { aplicarCohortGerencial } from './cohortCongelada';

const vivo = {
  taxa_sucesso_tim_pct: 10,
  portados: 50,
  falha_parcial: 5,
  canceladas: 20,
  fechados: 75,
  quebras: 3,
  bko: 2,
  taxa_os_pct: 80,
  com_os: 400,
};

describe('aplicarCohortGerencial', () => {
  it('sem coorte congelada mantém o CE vivo', () => {
    const r = aplicarCohortGerencial(vivo, null);
    expect(r.fonte).toBe('ce_vivo');
    expect(r.portados).toBe(50);
  });

  it('coorte sem universo não sobrepõe', () => {
    expect(aplicarCohortGerencial(vivo, { portados: 90 }).fonte).toBe('ce_vivo');
  });

  it('sobrepõe resultado e recalcula taxas sobre o universo congelado', () => {
    const r = aplicarCohortGerencial(vivo, {
      universo: 1000,
      portados: 300,
      falha_parcial: 20,
      canceladas: 180,
      quebras: 40,
    });
    expect(r.fonte).toBe('cohort_congelada');
    expect(r.universo_cohort).toBe(1000);
    expect(r.fechados).toBe(500);
    expect(r.sucesso_tim).toBe(320);
    expect(r.taxa_sucesso_tim_pct).toBe(32);
    expect(r.taxa_portado_sobre_fechados_pct).toBe(60);
    expect(r.taxa_em_voo_pct).toBe(46);
    expect(r.bko).toBe(2);
    expect(r.taxa_os_pct).toBe(80);
  });
});
