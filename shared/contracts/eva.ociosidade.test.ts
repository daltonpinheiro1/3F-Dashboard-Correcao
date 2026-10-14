import { describe, expect, it } from 'vitest';
import { parseEvaSnapshot } from './eva';

const base = { data: '2026-10-14', updated_at: '2026-10-14T10:00:00', jornada: [] };

describe('contrato EVA: ociosidade_hora* tolerante', () => {
  it('lista válida passa intacta', () => {
    const linhas = [{ hora: '10', espera_seg: 1, falando_seg: 1, pct: 50 }];
    const r = parseEvaSnapshot<Record<string, unknown>>(
      { ...base, ociosidade_hora: linhas, ociosidade_hora_camp: [{ ...linhas[0], campanha_op: 'MIGRACAO' }] },
      { kind: 'live' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.ociosidade_hora).toEqual(linhas);
      expect(r.value.ociosidade_hora_camp).toHaveLength(1);
    }
  });

  it('formato inválido some sem derrubar o snapshot', () => {
    const r = parseEvaSnapshot<Record<string, unknown>>(
      { ...base, ociosidade_hora: { '10': 1 }, ociosidade_hora_camp: 'x' },
      { kind: 'live' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect('ociosidade_hora' in r.value).toBe(false);
      expect('ociosidade_hora_camp' in r.value).toBe(false);
    }
  });

  it('itens que não são objetos saem da lista', () => {
    const r = parseEvaSnapshot<Record<string, unknown>>(
      { ...base, ociosidade_hora: [null, 3, { hora: '09' }] },
      { kind: 'live' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ociosidade_hora).toEqual([{ hora: '09' }]);
  });
});
