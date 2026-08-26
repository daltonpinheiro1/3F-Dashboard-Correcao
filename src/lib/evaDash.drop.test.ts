import { describe, expect, it } from 'vitest';
import {
  dropFromDiscagens,
  dropPorLogin,
  dropRate,
  formatPhoneFull,
  isTabDrop,
  isTabDropDiscagem,
  isTabEventoQueda,
  maskPhoneDisplay,
  phoneDigitsForCopy,
  resolveOpDrop,
  type EvaPayload,
} from './evaDash';

describe('DROP helpers (culpa vs evento)', () => {
  it('isTabEventoQueda cobre DESLIGOU e QUEDA (operacional)', () => {
    expect(isTabEventoQueda('12 - DESLIGOU SEM OUVIR PROPOSTA')).toBe(true);
    expect(isTabEventoQueda('16 - QUEDA DE LIGAÇÃO')).toBe(true);
    expect(isTabEventoQueda('CLIENTE DESLIGOU')).toBe(true);
    expect(isTabEventoQueda('26 - SEM INTERESSE')).toBe(false);
  });

  it('isTabDrop sem bit EVA NÃO imputa cliente/queda/desligou sem', () => {
    expect(isTabDrop('12 - DESLIGOU SEM OUVIR PROPOSTA')).toBe(false);
    expect(isTabDrop('16 - QUEDA DE LIGAÇÃO')).toBe(false);
    expect(isTabDrop('18 - QUEDA DE LIGACAO')).toBe(false);
    expect(isTabDrop('CLIENTE DESLIGOU')).toBe(false);
    expect(isTabDrop('26 - SEM INTERESSE')).toBe(false);
    expect(isTabDrop('AGENTE DESLIGOU')).toBe(true);
  });

  it('isTabDrop respeita bit Agente Desligou (EVA)', () => {
    expect(isTabDrop('12 - DESLIGOU SEM OUVIR PROPOSTA', true)).toBe(true);
    expect(isTabDrop('16 - QUEDA DE LIGAÇÃO', true)).toBe(true);
    expect(isTabDrop('25 - VENDA REALIZADA', true)).toBe(true);
    expect(isTabDrop('12 - DESLIGOU SEM OUVIR PROPOSTA', false)).toBe(false);
    expect(isTabDrop('AGENTE DESLIGOU', false)).toBe(false);
  });

  it('dropRate arredonda em 1 casa', () => {
    expect(dropRate(0, 0)).toBe(0);
    expect(dropRate(1, 3)).toBe(33.3);
    expect(dropRate(22, 43)).toBe(51.2);
  });

  it('dropPorLogin usa culpa (não evento) e aceita drop_agente', () => {
    const m = dropPorLogin([
      { login: 'op1', nome: '12 - DESLIGOU SEM OUVIR PROPOSTA', total: 10 },
      { login: 'op1', nome: 'SEM INTERESSE', total: 10 },
      { login: 'op2', nome: 'QUEDA DE LIGAÇÃO', total: 5 },
      { login: 'op3', nome: '12 - DESLIGOU SEM OUVIR', total: 4, drop_agente: 1 },
    ]);
    expect(m.op1.drop).toBe(0);
    expect(m.op1.evento).toBe(10);
    expect(m.op1.tabs).toBe(20);
    expect(m.op1.rate).toBe(0);
    expect(m.op2.drop).toBe(0);
    expect(m.op2.evento).toBe(5);
    expect(m.op3.drop).toBe(1);
    expect(m.op3.rate).toBe(25);
  });

  it('maskPhoneDisplay mascara dígitos', () => {
    expect(maskPhoneDisplay(11, '999887766')).toBe('(11) *****7766');
    expect(maskPhoneDisplay(null, '****7766')).toBe('****7766');
    expect(maskPhoneDisplay(null, null)).toBe('—');
  });

  it('formatPhoneFull e phoneDigitsForCopy', () => {
    expect(formatPhoneFull(75, '999991360')).toBe('(75) 99999-1360');
    expect(phoneDigitsForCopy(75, '999991360')).toBe('75999991360');
    expect(formatPhoneFull(11, '****7766')).toBe('(11) ****7766');
    expect(phoneDigitsForCopy(11, '****7766')).toBe('');
  });

  it('isTabDropDiscagem é diagnóstico e NÃO define DROP% do dash', () => {
    expect(isTabDropDiscagem('16 - QUEDA DE LIGAÇÃO')).toBe(true);
    expect(isTabDropDiscagem('22 - CAIXA POSTAL')).toBe(true);
    expect(isTabDropDiscagem('20 - LIGACAO MUDA')).toBe(true);
    // Culpa / DROP% canônico continua só agente
    expect(isTabDrop('22 - CAIXA POSTAL')).toBe(false);
    expect(isTabDrop('16 - QUEDA DE LIGAÇÃO')).toBe(false);
    expect(isTabDrop('12 - DESLIGOU SEM OUVIR', true)).toBe(true);
  });

  it('dropFromDiscagens / resolveOpDrop usam Agente Desligou', () => {
    const payload = {
      discagens: {
        kpis: { dialed: 100, contact: 50, tabuladas: 40, cpc: 10, sucesso: 2 },
        por_operador: [
          {
            id_user: 1,
            user_name: 'MARIA SILVA',
            supervisor_name: 'SUP A',
            queue_name: 'controle',
            campanha_op: 'PORTABILIDADE',
            tabuladas: 20,
            cpc: 5,
            sucesso: 1,
            cpc_rate: 25,
            conv_tab: 5,
            desligue_agente: 4,
            desligue_agente_rate: 20,
          },
        ],
        por_supervisor: [
          {
            supervisor_name: 'SUP A',
            operadores: 1,
            tabuladas: 20,
            cpc: 5,
            sucesso: 1,
            cpc_rate: 25,
            conv_tab: 5,
            desligue_agente: 4,
            desligue_agente_rate: 20,
          },
        ],
        tab_hora: [
          {
            nome: '12 - DESLIGOU SEM OUVIR',
            campanha_op: 'PORTABILIDADE',
            total: 10,
            drop_total: 2,
            pct_drop: 20,
            horas: { '14': 3 },
            pct_hora: {},
            horas_drop: { '14': 1 },
          },
        ],
      },
    } as unknown as EvaPayload;

    const maps = dropFromDiscagens([payload], 'TODAS');
    expect(maps.byName['MARIA SILVA'].drop).toBe(4);
    expect(maps.byName['MARIA SILVA'].rate).toBe(20);
    expect(maps.bySup['SUP A'].rate).toBe(20);
    expect(maps.byTab['12 - DESLIGOU SEM OUVIR'].drop).toBe(2);

    const horaMaps = dropFromDiscagens([payload], 'TODAS', '14');
    expect(horaMaps.byTab['12 - DESLIGOU SEM OUVIR'].drop).toBe(1);
    expect(horaMaps.byTab['12 - DESLIGOU SEM OUVIR'].tabs).toBe(3);

    const d = resolveOpDrop('x', 'Maria Silva', maps);
    expect(d.rate).toBe(20);
  });
});
