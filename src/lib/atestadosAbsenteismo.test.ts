import { describe, expect, it } from 'vitest';
import { detectarPadroesAbsenteismo } from './atestadosAbsenteismo';
import type { Atestado } from './atestadosEscala';

describe('atestadosAbsenteismo', () => {
  it('detecta frequência elevada', () => {
    const ref = new Date('2026-08-28');
    const rows = [1, 2, 3].map((i) => ({
      id: String(i),
      protocolo: `AT-${i}`,
      colaborador_nome: 'João',
      colaborador_matricula: '100',
      tipo: 'medico' as const,
      unidade_periodo: 'dias' as const,
      quantidade_dias: 2,
      status: 'protocolado' as const,
      data_inicio: `2026-08-${10 + i}`,
      created_at: '2026-08-01',
      updated_at: '2026-08-01',
    })) as Atestado[];
    const p = detectarPadroesAbsenteismo(rows, ref);
    expect(p.some((x) => x.titulo.includes('3 atestados'))).toBe(true);
  });
});
