import { describe, expect, it } from 'vitest';
import { medirOciosidade } from './ociosidade';
import type { EvaJornada } from './evaDash';

function j(partial: Partial<EvaJornada>): EvaJornada {
  return {
    id_user: 1,
    user_name: 'Ana',
    login: 'ana',
    supervisor_name: 'Sarah',
    campaign_name: 'Port',
    date_login: '2026-09-22T09:00:00',
    date_logout: null,
    logins: 1,
    logged_time: 3600,
    paused_time: 0,
    ...partial,
  };
}

describe('medirOciosidade', () => {
  it('mede a espera entre ligações e a venda que cabia nesse tempo', () => {
    const out = medirOciosidade([
      j({
        available_time: 1200,
        working_time: 1800,
        classifying_time: 300,
        logged_time: 3600,
        chamadas: 10,
        tabuladas: 10,
        sucesso: 2,
        tma_seg: 120,
      }),
    ]);
    expect(out.medido).toBe(true);
    expect(out.espera).toBe(1200);
    expect(out.intervaloMedio).toBe(120);
    expect(out.pct).toBeCloseTo(33.3, 0);
    expect(out.chamadasPerdidas).toBe(10);
    expect(out.vendasPerdidas).toBe(2);
  });

  it('não conta duas vezes a mesma linha da jornada', () => {
    const row = j({ available_time: 600, working_time: 600, chamadas: 4, tma_seg: 60, tabuladas: 4, sucesso: 0 });
    const out = medirOciosidade([row, { ...row }]);
    expect(out.espera).toBe(600);
    expect(out.operadores).toBe(1);
  });

  it('sem tempo disponível não inventa perda', () => {
    const out = medirOciosidade([j({ logged_time: 100 })]);
    expect(out.medido).toBe(false);
    expect(out.chamadasPerdidas).toBe(0);
  });
});
