import { describe, expect, it } from 'vitest';
import { detectarPadroesAbsenteismo, referenciaPadroesAno } from './atestadosAbsenteismo';
import type { Atestado } from './atestadosEscala';

const row = (over: Partial<Atestado>): Atestado =>
  ({
    id: '1',
    protocolo: 'AT-1',
    colaborador_nome: 'João',
    colaborador_matricula: '100',
    tipo: 'medico',
    unidade_periodo: 'dias',
    status: 'protocolado',
    created_at: '2026-08-01',
    updated_at: '2026-08-01',
    ...over,
  }) as Atestado;

describe('atestadosAbsenteismo', () => {
  it('detecta frequência elevada', () => {
    const ref = new Date('2026-08-28');
    const rows = [1, 2, 3].map((i) =>
      row({ id: String(i), protocolo: `AT-${i}`, quantidade_dias: 2, data_inicio: `2026-08-${10 + i}` }),
    );
    const p = detectarPadroesAbsenteismo(rows, ref);
    expect(p.some((x) => x.titulo.includes('3 atestados'))).toBe(true);
  });

  it('dias acumulados usam as datas quando quantidade_dias está vazia', () => {
    const rows = [
      row({ id: 'a', data_inicio: '2026-08-01', data_fim: '2026-08-07', quantidade_dias: 0 }),
      row({ id: 'b', data_inicio: '2026-08-15', data_fim: '2026-08-21', quantidade_dias: 0 }),
    ];
    const p = detectarPadroesAbsenteismo(rows, new Date('2026-08-28'));
    expect(p.find((x) => x.id.startsWith('dias-'))?.titulo).toBe('14 dias afastados em 60 dias');
  });

  it('janela relativa ao ano filtrado', () => {
    const hoje = new Date('2026-10-14T12:00:00Z');
    expect(referenciaPadroesAno(2026, hoje)).toBe(hoje);
    expect(referenciaPadroesAno(2025, hoje).toISOString().slice(0, 10)).toBe('2025-12-31');
    const rows = [1, 2, 3].map((i) =>
      row({ id: String(i), quantidade_dias: 1, data_inicio: `2025-12-${10 + i}` }),
    );
    expect(detectarPadroesAbsenteismo(rows, hoje)).toHaveLength(0);
    expect(detectarPadroesAbsenteismo(rows, referenciaPadroesAno(2025, hoje)).length).toBeGreaterThan(0);
  });
});
