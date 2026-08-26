import { describe, expect, it } from 'vitest';
import {
  nivelIdxFromSelecao,
  parseNivelIdx,
  resumoMedida,
  opcoesFiltroNivel,
} from './escalaMedidaUi';

describe('escalaMedidaUi', () => {
  it('mapeia idx ↔ categoria simples', () => {
    expect(parseNivelIdx(0).categoria).toBe('feedback_formal');
    expect(parseNivelIdx(1).categoria).toBe('advertencia_verbal');
    expect(parseNivelIdx(10).categoria).toBe('apuracao_juridica');
    expect(nivelIdxFromSelecao({ categoria: 'feedback_formal' })).toBe(0);
  });

  it('distingue ciclos de advertência escrita', () => {
    expect(parseNivelIdx(2).cicloEscrita).toBe(1);
    expect(parseNivelIdx(6).cicloEscrita).toBe(3);
    expect(
      nivelIdxFromSelecao({ categoria: 'advertencia_escrita', cicloEscrita: 4 }),
    ).toBe(8);
  });

  it('mapeia dias de suspensão', () => {
    expect(parseNivelIdx(3).diasSuspensao).toBe(1);
    expect(parseNivelIdx(9).diasSuspensao).toBe(5);
    expect(nivelIdxFromSelecao({ categoria: 'suspensao', diasSuspensao: 2 })).toBe(5);
  });

  it('resumo inclui etapa e contexto', () => {
    expect(resumoMedida(3)).toContain('Suspensão 1 dia');
    expect(resumoMedida(2)).toContain('1ª advertência escrita');
    expect(resumoMedida(10)).toContain('CRÍTICO');
  });

  it('filtro agrupa opções sem repetir label cru', () => {
    const opts = opcoesFiltroNivel();
    const escritas = opts.filter((o) => o.group === 'Advertência escrita');
    expect(escritas).toHaveLength(4);
    expect(new Set(escritas.map((o) => o.label)).size).toBe(4);
  });
});
