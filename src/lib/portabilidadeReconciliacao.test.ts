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
