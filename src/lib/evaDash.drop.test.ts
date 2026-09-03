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
  resolveSupDrop,
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
    expect(maps.bySupOps['SUP A'].rate).toBe(20);
    expect(maps.byTab['12 - DESLIGOU SEM OUVIR'].drop).toBe(2);

    const horaMaps = dropFromDiscagens([payload], 'TODAS', '14');
    expect(horaMaps.byTab['12 - DESLIGOU SEM OUVIR'].drop).toBe(1);
    expect(horaMaps.byTab['12 - DESLIGOU SEM OUVIR'].tabs).toBe(3);

    const d = resolveOpDrop('x', 'Maria Silva', maps);
    expect(d.rate).toBe(20);
  });

  it('filtro de campanha não mistura DROP (sem falso positivo)', () => {
    const payload = {
      discagens: {
        kpis: { dialed: 10, contact: 5, tabuladas: 30, cpc: 2, sucesso: 0 },
        por_operador: [
          {
            id_user: 1,
            user_name: 'OP PORT',
            login: 'port1',
            supervisor_name: 'SUP',
            queue_name: 'TIM PORTABILIDADE',
            campanha_op: 'PORTABILIDADE',
            tabuladas: 10,
            cpc: 1,
            sucesso: 0,
            cpc_rate: 10,
            conv_tab: 0,
            desligue_agente: 5,
          },
          {
            id_user: 2,
            user_name: 'OP BKO',
            login: 'bko1',
            supervisor_name: 'SUP',
            queue_name: 'TIM ACAO BKO',
            campanha_op: 'ACAO_BKO',
            tabuladas: 10,
            cpc: 1,
            sucesso: 0,
            cpc_rate: 10,
            conv_tab: 0,
            desligue_agente: 8,
          },
          {
            id_user: 3,
            user_name: 'OP OUTROS LIVE',
            login: 'old1',
            supervisor_name: 'SUP',
            queue_name: '04 - TIM ACAO BKO',
            campanha_op: 'OUTROS',
            tabuladas: 10,
            cpc: 0,
            sucesso: 0,
            cpc_rate: 0,
            conv_tab: 0,
            desligue_agente: 3,
          },
        ],
        por_supervisor: [
          {
            supervisor_name: 'SUP PORT',
            campanha_op: 'PORTABILIDADE',
            operadores: 1,
            tabuladas: 10,
            cpc: 1,
            sucesso: 0,
            cpc_rate: 10,
            conv_tab: 0,
            desligue_agente: 5,
          },
          {
            supervisor_name: 'SUP BKO',
            campanha_op: 'ACAO_BKO',
            operadores: 1,
            tabuladas: 10,
            cpc: 1,
            sucesso: 0,
            cpc_rate: 10,
            conv_tab: 0,
            desligue_agente: 8,
          },
          {
            supervisor_name: 'SUP SEM CAMP',
            operadores: 1,
            tabuladas: 99,
            cpc: 0,
            sucesso: 0,
            cpc_rate: 0,
            conv_tab: 0,
            desligue_agente: 50,
          },
        ],
        tab_hora: [
          {
            nome: '12 - DESLIGOU SEM OUVIR CONTROLE',
            campanha_op: 'PORTABILIDADE',
            total: 10,
            drop_total: 2,
            pct_drop: 20,
            horas: {},
            pct_hora: {},
            horas_drop: {},
          },
          {
            nome: 'AGENTE DESLIGOU',
            campanha_op: 'ACAO_BKO',
            total: 10,
            drop_total: 7,
            pct_drop: 70,
            horas: {},
            pct_hora: {},
            horas_drop: {},
          },
        ],
      },
    } as unknown as EvaPayload;

    const port = dropFromDiscagens([payload], 'PORTABILIDADE');
    expect(port.byLogin['PORT1']?.drop).toBe(5);
    expect(port.byLogin['BKO1']).toBeUndefined();
    expect(port.byLogin['OLD1']).toBeUndefined();
    expect(port.bySup['SUP PORT']?.drop).toBe(5);
    expect(port.bySup['SUP BKO']).toBeUndefined();
    expect(port.bySup['SUP SEM CAMP']).toBeUndefined();
    expect(port.byTab['12 - DESLIGOU SEM OUVIR CONTROLE']?.drop).toBe(2);
    expect(port.byTab['AGENTE DESLIGOU']).toBeUndefined();

    const bko = dropFromDiscagens([payload], 'ACAO_BKO');
    expect(bko.byLogin['BKO1']?.drop).toBe(8);
    expect(bko.byLogin['OLD1']?.drop).toBe(3); // OUTROS + fila BKO reclassifica
    expect(bko.byLogin['PORT1']).toBeUndefined();
    expect(bko.bySup['SUP BKO']?.drop).toBe(8);
    expect(bko.bySup['SUP PORT']).toBeUndefined();
    expect(bko.byTab['AGENTE DESLIGOU']?.drop).toBe(7);
    expect(bko.byTab['12 - DESLIGOU SEM OUVIR CONTROLE']).toBeUndefined();
  });

  it('nome de tabulação não classifica campanha (anti falso positivo)', () => {
    const payload = {
      discagens: {
        kpis: { dialed: 1, contact: 1, tabuladas: 5, cpc: 0, sucesso: 0 },
        por_operador: [],
        por_supervisor: [],
        tab_hora: [
          {
            // texto "controle" no nome NÃO pode virar MIGRACAO
            nome: 'SEM INTERESSE NO CONTROLE DA CONTA',
            campanha_op: 'OUTROS',
            total: 5,
            drop_total: 5,
            pct_drop: 100,
            horas: {},
            pct_hora: {},
            horas_drop: {},
          },
        ],
      },
    } as unknown as EvaPayload;

    const mig = dropFromDiscagens([payload], 'MIGRACAO');
    expect(mig.byTab['SEM INTERESSE NO CONTROLE DA CONTA']).toBeUndefined();
  });

  it('resolveSupDrop usa operadores quando por_supervisor vem com DROP 0', () => {
    const payload = {
      discagens: {
        kpis: { dialed: 50, contact: 20, tabuladas: 30, cpc: 5, sucesso: 2 },
        por_operador: [
          {
            id_user: 1,
            user_name: 'OP A',
            login: 'opa',
            supervisor_name: 'Sarah Daniela de Jesus',
            queue_name: 'TIM PORTABILIDADE',
            campanha_op: 'PORTABILIDADE',
            tabuladas: 20,
            cpc: 10,
            sucesso: 1,
            cpc_rate: 50,
            conv_tab: 5,
            desligue_agente: 4,
          },
        ],
        por_supervisor: [
          {
            supervisor_name: 'Sarah Daniela de Jesus',
            campanha_op: 'PORTABILIDADE',
            operadores: 1,
            tabuladas: 20,
            cpc: 10,
            sucesso: 1,
            cpc_rate: 50,
            conv_tab: 5,
            desligue_agente: 0,
          },
        ],
      },
    } as unknown as EvaPayload;

    const maps = dropFromDiscagens([payload], 'PORTABILIDADE');
    expect(maps.bySup['SARAH DANIELA DE JESUS']?.drop).toBe(0);
    expect(maps.bySupOps['SARAH DANIELA DE JESUS']?.drop).toBe(4);
    expect(resolveSupDrop('Sarah Daniela de Jesus', maps).rate).toBe(20);
    expect(resolveSupDrop('SARAH DANIELA', maps).drop).toBe(4);
    expect(resolveSupDrop('ANA', maps).drop).toBe(0);
  });
});
