import { describe, expect, it } from 'vitest';
import {
  agregarCrivoEva,
  agregarErroDia,
  agregarFunilLogistica,
  agregarSmsDia,
  dedupePorProposta,
  listaErroDia,
  listaGrossDia,
  rr360PortAplicavel,
} from './rr360';
import type { FunilPayload } from '../types/portabilidade';

describe('agregarSmsDia', () => {
  it('conta gross e portados consolidados', () => {
    const r = agregarSmsDia([
      { proposta_id: 'a', classificacao: 'sucesso', ticket_status: null },
      { proposta_id: 'b', classificacao: 'aguardando', ticket_status: 'Portado' },
      { proposta_id: 'c', classificacao: 'insucesso', ticket_status: 'Conflito' },
    ]);
    expect(r.vendasBrutas).toBe(3);
    expect(r.portadosConsolidado).toBe(2);
    expect(r.pctPortadosGross).toBe(66.7);
  });

  it('dedupe por proposta_id (Gross não infla duplicata)', () => {
    const r = agregarSmsDia([
      { proposta_id: 'x', classificacao: 'aguardando', ticket_status: null },
      { proposta_id: 'x', classificacao: 'sucesso', ticket_status: 'Portado' },
      { proposta_id: 'y', classificacao: 'insucesso', ticket_status: null },
    ]);
    expect(r.vendasBrutas).toBe(2);
    expect(r.portadosConsolidado).toBe(1);
  });

  it('lista Gross cap 80 após dedupe', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      proposta_id: `p${i}`,
      classificacao: 'aguardando',
      ticket_status: null,
      vendedor: 'Ana',
    }));
    expect(listaGrossDia(rows)).toHaveLength(80);
    expect(listaGrossDia([{ proposta_id: 'x', vendedor: 'B' }])[0].vendedor).toBe('B');
  });
});

describe('dedupePorProposta', () => {
  it('mantém linhas sem proposta_id', () => {
    const rows = [{ proposta_id: '' }, { proposta_id: null }, { proposta_id: '1' }, { proposta_id: '1' }];
    const out = dedupePorProposta(rows, (a) => a);
    expect(out).toHaveLength(3);
  });
});

describe('agregarErroDia', () => {
  it('taxa erro operacional', () => {
    const r = agregarErroDia([
      { tipos_erro: ['cep_incorreto'] },
      { tipos_erro: [] },
      { tipos_erro: ['referencia_tratamento'] },
    ]);
    expect(r.propostas).toBe(3);
    expect(r.comErro).toBe(1);
    expect(r.taxaErroPct).toBe(33.3);
    expect(listaErroDia([{ tipos_erro: ['cep_incorreto'], proposta_id: 'z', vendedor: 'C' }])).toHaveLength(1);
    expect(listaErroDia([{ tipos_erro: ['referencia_tratamento'], proposta_id: 'z' }])).toHaveLength(0);
  });
});

describe('agregarCrivoEva', () => {
  const jorn = [
    {
      id_user: 1,
      user_name: 'a',
      login: 'a',
      supervisor_name: 's',
      campaign_name: 'p',
      date_login: null,
      date_logout: null,
      logins: 1,
      logged_time: 1,
      paused_time: 0,
      sucesso: 10,
      aprovadas: 8,
      vb: 10,
    },
  ];

  it('usa isize quando cruzamento ativo em TODAS/Port', () => {
    const r = agregarCrivoEva([], { isize_cruzamento: true, isize_total: 100, isize_aceitas: 85 }, 'PORTABILIDADE');
    expect(r.taxaAprovadasPct).toBe(85);
    expect(r.isizeCruzamento).toBe(true);
  });

  it('não usa iSize global com campanha Mig/BKO filtrada', () => {
    const r = agregarCrivoEva(jorn, { isize_cruzamento: true, isize_total: 100, isize_aceitas: 85 }, 'MIGRACAO');
    expect(r.isizeCruzamento).toBe(false);
    expect(r.taxaAprovadasPct).toBe(80);
    expect(r.sucessoEva).toBe(10);
  });

  it('cai para jornada quando sem isize', () => {
    const r = agregarCrivoEva(jorn, null);
    expect(r.taxaAprovadasPct).toBe(80);
  });
});

describe('rr360PortAplicavel', () => {
  it('só Port e Todas carregam Gross/TIM', () => {
    expect(rr360PortAplicavel('TODAS')).toBe(true);
    expect(rr360PortAplicavel('PORTABILIDADE')).toBe(true);
    expect(rr360PortAplicavel('MIGRACAO')).toBe(false);
    expect(rr360PortAplicavel('ACAO_BKO')).toBe(false);
  });
});

describe('agregarFunilLogistica', () => {
  it('soma entregues e sucesso TIM', () => {
    const funil: FunilPayload = {
      fatias: [
        { id: 'entregue_com_chip', label: '', grupo: 'logistica', cor: 'teal', descricao: '', count: 40, pct: 1 },
        { id: 'entregue_aguardando_chip', label: '', grupo: 'logistica', cor: 'cyan', descricao: '', count: 10, pct: 1 },
        { id: 'em_transito', label: '', grupo: 'logistica', cor: 'sky', descricao: '', count: 100, pct: 5 },
      ],
      gerencial: { portados: 753, falha_parcial: 165, sucesso_tim: 918, taxa_sucesso_tim_pct: 14 },
      reconciliacao: { universo: 6558, soma_fatias: 6558, fecha: true, em_voo: 0, fechados: 0, orfaos: 0 },
    };
    const r = agregarFunilLogistica(funil);
    expect(r.entregues).toBe(50);
    expect(r.funilSucessoTim).toBe(918);
    expect(r.emTransito).toBe(100);
  });
});
