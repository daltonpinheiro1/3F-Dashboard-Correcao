import { describe, expect, it } from 'vitest';
import { buildNowcast, SABADO_HORAS } from './horaPageData';

describe('nowcast de sábado: janela 09–16h', () => {
  it('sábado usa 7 faixas (09..15) mesmo com expediente maior', () => {
    const now = buildNowcast([{ hora: '09', total: 10, sucesso: 2 }], [], 2300, 12, '2026-10-17', '10');
    expect(now.rows).toHaveLength(SABADO_HORAS);
    expect(now.rows[now.rows.length - 1].hora).toBe('15h');
    expect(now.horasDecorridas + now.horasRestantes).toBe(7);
    expect(now.metaHora).toBeCloseTo(now.metaDia / 7, 1);
  });

  it('sábado respeita expediente menor que a janela', () => {
    const now = buildNowcast([], [], 2300, 5, '2026-10-17', '10');
    expect(now.rows).toHaveLength(5);
  });

  it('dia útil mantém o expediente configurado', () => {
    const now = buildNowcast([], [], 2300, 12, '2026-10-16', '10');
    expect(now.rows).toHaveLength(12);
  });
});
