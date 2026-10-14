import { describe, expect, it } from 'vitest';
import { buildP0SlackPayload, validarBodyP0 } from './portabilidadeP0Alert';

describe('validarBodyP0', () => {
  it.each([
    [null],
    [[]],
    [{ mes: 202610, alertas: [] }],
    [{ mes: '2026-10', alertas: 'x' }],
    [{ mes: '2026-10', alertas: [null] }],
    [{ mes: '2026-10', alertas: [{ id: 1, prioridade: 'P0', titulo: 'T' }] }],
    [{ mes: '2026-10', alertas: [{ id: 'a', prioridade: 'P0', titulo: { x: 1 } }] }],
    [{ mes: '2026-10', alertas: [{ id: 'a', prioridade: 'P0', titulo: 'T', valor: '80' }] }],
  ])('rejeita tipo errado → 400 (%j)', (raw) => {
    expect(validarBodyP0(raw).ok).toBe(false);
  });

  it('aceita payload do GerencialP0Strip (campos extras e opcionais nulos)', () => {
    const r = validarBodyP0({
      mes: '2026-10',
      alertas: [{ id: 'bko', prioridade: 'P0', titulo: 'BKO', descricao: null, valor: 80, fatiaId: 'bko' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.alertas[0]).toEqual({
      id: 'bko',
      prioridade: 'P0',
      titulo: 'BKO',
      descricao: undefined,
      acao: undefined,
      valor: 80,
    });
  });
});

describe('buildP0SlackPayload', () => {
  it('alerta sem descrição não imprime "undefined" no Slack', () => {
    const p = buildP0SlackPayload({
      mes: '2026-10',
      alertas: [{ id: 'bko_alto', titulo: 'Fila BKO elevada', valor: 80, acao: 'Triagem BKO' }],
    });
    const texto = (p.blocks[1] as { text: { text: string } }).text.text;
    expect(texto).not.toContain('undefined');
    expect(texto).toBe('• *Fila BKO elevada* (80)\n  → Triagem BKO');
  });

  it('mantém descrição quando presente', () => {
    const p = buildP0SlackPayload({
      mes: '2026-10',
      alertas: [{ id: 'x', titulo: 'T', descricao: 'D' }],
    });
    expect((p.blocks[1] as { text: { text: string } }).text.text).toBe('• *T*\n  D');
  });
});
