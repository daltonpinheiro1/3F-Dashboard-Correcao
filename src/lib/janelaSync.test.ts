import { describe, expect, it } from 'vitest';
import { janelaSyncAberta, proximaJanelaSync } from './janelaSync';

const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('janela do sync (mesma do orquestrador)', () => {
  it('seg–sex abre 09h e fecha 21h', () => {
    expect(janelaSyncAberta(brt('2026-09-29T08:28:00'))).toBe(false);
    expect(janelaSyncAberta(brt('2026-09-29T09:00:00'))).toBe(true);
    expect(janelaSyncAberta(brt('2026-09-29T20:59:00'))).toBe(true);
    expect(janelaSyncAberta(brt('2026-09-29T21:00:00'))).toBe(false);
  });

  it('sábado fecha 16h e domingo não abre', () => {
    expect(janelaSyncAberta(brt('2026-10-03T15:59:00'))).toBe(true);
    expect(janelaSyncAberta(brt('2026-10-03T16:00:00'))).toBe(false);
    expect(janelaSyncAberta(brt('2026-10-04T12:00:00'))).toBe(false);
  });

  it('diz quando volta', () => {
    expect(proximaJanelaSync(brt('2026-09-29T08:28:00'))).toBe('hoje às 09h');
    expect(proximaJanelaSync(brt('2026-09-29T22:00:00'))).toBe('amanhã às 09h');
    expect(proximaJanelaSync(brt('2026-10-02T22:00:00'))).toBe('amanhã às 09h');
    expect(proximaJanelaSync(brt('2026-10-03T17:00:00'))).toBe('segunda às 09h');
    expect(proximaJanelaSync(brt('2026-10-04T10:00:00'))).toBe('segunda às 09h');
  });
});
