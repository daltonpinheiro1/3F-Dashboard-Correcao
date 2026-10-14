import { describe, expect, it } from 'vitest';
import { sanitizeDropDiscagens, type EvaDiscagens, type EvaDiscagensOperador } from './evaDash';

const op = (o: Partial<EvaDiscagensOperador>): EvaDiscagensOperador => ({
  id_user: 1,
  user_name: 'ANA',
  supervisor_name: 'SUP',
  queue_name: 'F',
  tabuladas: 0,
  cpc: 0,
  sucesso: 0,
  cpc_rate: 0,
  conv_tab: 0,
  ...o,
});

describe('sanitizeDropDiscagens', () => {
  it('empate de tabuladas sem desligue_tabs: DROP do dia vai para uma fatia só', () => {
    const d: EvaDiscagens = {
      kpis: { dialed: 0, contact: 0, tabuladas: 20, cpc: 0, sucesso: 0, contact_rate: 0, cpc_rate: 0, efficacy: 0 },
      por_operador: [
        op({ queue_name: 'FILA A', tabuladas: 10, desligue_agente: 3, campanha_op: 'PORTABILIDADE' }),
        op({ queue_name: 'FILA B', tabuladas: 10, desligue_agente: 3, campanha_op: 'PORTABILIDADE' }),
      ],
      por_supervisor: [],
    };
    const out = sanitizeDropDiscagens(d).por_operador || [];
    const somaDrop = out.reduce((s, o) => s + (o.desligue_agente || 0), 0);
    expect(somaDrop).toBe(3);
    expect(out[0].desligue_agente).toBe(3);
    expect(out[0].desligue_tabs).toBe(20);
    expect(out[1].desligue_agente).toBe(0);
  });

  it('host com desligue_tabs continua sendo o host', () => {
    const d: EvaDiscagens = {
      kpis: { dialed: 0, contact: 0, tabuladas: 30, cpc: 0, sucesso: 0, contact_rate: 0, cpc_rate: 0, efficacy: 0 },
      por_operador: [
        op({ queue_name: 'SAT', tabuladas: 20, desligue_agente: 0 }),
        op({ queue_name: 'HOST', tabuladas: 10, desligue_agente: 4, desligue_tabs: 30 }),
      ],
      por_supervisor: [],
    };
    const out = sanitizeDropDiscagens(d).por_operador || [];
    expect(out[0].desligue_agente).toBe(0);
    expect(out[1].desligue_agente).toBe(4);
    expect(out[1].desligue_tabs).toBe(30);
  });
});
