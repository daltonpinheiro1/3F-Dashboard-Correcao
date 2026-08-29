import { describe, expect, it } from 'vitest';
import { gestorDaAdvertencia, parseSupervisorFromObs } from './advertenciasGestor';

describe('advertenciasGestor', () => {
  it('parseSupervisorFromObs', () => {
    expect(parseSupervisorFromObs('Supervisor EVA: Ana Silva')).toBe('Ana Silva');
    expect(parseSupervisorFromObs('nota\nSupervisor EVA: Carol\nmais')).toBe('Carol');
    expect(parseSupervisorFromObs('sem gestor')).toBe('');
  });

  it('gestorDaAdvertencia prioriza campo dedicado', () => {
    expect(
      gestorDaAdvertencia({
        colaborador_supervisor: 'Gestor A',
        observacoes_supervisor: 'Supervisor EVA: Outro',
      }),
    ).toBe('Gestor A');
    expect(
      gestorDaAdvertencia({
        colaborador_supervisor: null,
        observacoes_supervisor: 'Supervisor EVA: Carol',
      }),
    ).toBe('Carol');
  });
});
