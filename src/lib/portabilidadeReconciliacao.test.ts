import { describe, expect, it } from 'vitest';
import {
  reconciliaHistoricoFunil,
  validarEstagios,
  validarFunilExclusivo,
} from './portabilidadeReconciliacao';

describe('reconciliaHistoricoFunil', () => {
  it('ok quando números batem', () => {
    const r = reconciliaHistoricoFunil(
      {
        portados: 753,
        falha_parcial: 165,
        canceladas: 2506,
        fechados: 3424,
        sucesso_tim: 918,
        quebras: 439,
        bko: 797,
      },
      {
        mes: '2026-08',
        portados: 753,
        falha_parcial: 165,
        canceladas: 2506,
        fechados: 3424,
        sucesso_tim: 918,
        quebras: 439,
        bko: 797,
        execucoes: 5000,
        activate_ok: 600,
        taxa_portado_pct: 22,
        taxa_sucesso_fila_pct: 92,
      },
    );
    expect(r?.ok).toBe(true);
    expect(r?.gaps).toHaveLength(0);
  });

  it('reporta gap quando portados divergem', () => {
    const r = reconciliaHistoricoFunil(
      { portados: 800, falha_parcial: 0, canceladas: 0, fechados: 800, quebras: 0, bko: 0 },
      {
        mes: '2026-08',
        portados: 753,
        falha_parcial: 0,
        canceladas: 0,
        fechados: 753,
        quebras: 0,
        bko: 0,
        execucoes: 0,
        activate_ok: 0,
        taxa_portado_pct: 0,
        taxa_sucesso_fila_pct: 0,
      },
    );
    expect(r?.ok).toBe(false);
    expect(r?.gaps.some((g) => g.campo === 'portados')).toBe(true);
  });

  const hist = {
    mes: '2026-09',
    portados: 100,
    falha_parcial: 20,
    canceladas: 300,
    fechados: 420,
    sucesso_tim: 120,
    universo: 2000,
    quebras: 0,
    bko: 0,
    execucoes: 0,
    activate_ok: 0,
    taxa_portado_pct: 5,
    taxa_sucesso_fila_pct: 0,
  };

  it('base_tim no fechados vivo não gera gap falso contra o histórico', () => {
    const r = reconciliaHistoricoFunil(
      { portados: 100, falha_parcial: 20, canceladas: 300, fechados: 470, sucesso_tim: 120, quebras: 0, bko: 0 },
      hist,
      2000,
    );
    expect(r?.gaps).toEqual([]);
    expect(r?.ok).toBe(true);
  });

  it('mês congelado compara o universo da coorte, não o CE vivo encolhido', () => {
    const r = reconciliaHistoricoFunil(
      {
        portados: 100,
        falha_parcial: 20,
        canceladas: 300,
        fechados: 420,
        sucesso_tim: 120,
        quebras: 0,
        bko: 0,
        universo_cohort: 2000,
      },
      hist,
      1500,
    );
    expect(r?.ok).toBe(true);
  });
});

describe('nota da reconciliação', () => {
  const histBase = {
    mes: '2026-09',
    portados: 100,
    falha_parcial: 20,
    canceladas: 300,
    fechados: 420,
    sucesso_tim: 120,
    quebras: 50,
    bko: 40,
    execucoes: 0,
    activate_ok: 0,
    taxa_portado_pct: 5,
    taxa_sucesso_fila_pct: 0,
  };

  it('quebras/BKO divergentes explicam a diferença de definição, não truncamento', () => {
    const r = reconciliaHistoricoFunil(
      { portados: 100, falha_parcial: 20, canceladas: 300, quebras: 30, bko: 12 },
      histBase,
    );
    expect(r?.ok).toBe(false);
    expect(r?.nota).toContain('fatia atual');
    expect(r?.nota).not.toMatch(/truncamento/i);
  });

  it('resultado divergente com truncamento cita as fontes truncadas', () => {
    const r = reconciliaHistoricoFunil(
      { portados: 90, falha_parcial: 20, canceladas: 300, quebras: 50, bko: 40 },
      histBase,
      undefined,
      ['ce_portados'],
    );
    expect(r?.nota).toContain('truncado (ce_portados)');
  });

  it('usa fechados_tim do funil quando presente', () => {
    const r = reconciliaHistoricoFunil(
      { portados: 100, falha_parcial: 20, canceladas: 300, fechados: 999, quebras: 50, bko: 40, ...{ fechados_tim: 420 } },
      histBase,
    );
    expect(r?.ok).toBe(true);
  });
});

describe('validarFunilExclusivo', () => {
  it('soma = universo', () => {
    const r = validarFunilExclusivo(
      [
        { valor: 753 },
        { valor: 165 },
        { valor: 2506 },
        { valor: 3134 },
      ],
      6558,
    );
    expect(r.ok).toBe(true);
  });
});

describe('validarEstagios', () => {
  it('detecta gap nos grupos', () => {
    const r = validarEstagios([{ valor: 100 }, { valor: 200 }], 500);
    expect(r.ok).toBe(false);
    expect(r.delta).toBe(200);
  });
});
