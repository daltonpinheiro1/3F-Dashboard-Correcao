import { describe, expect, it } from 'vitest';
import { agruparAlertasInss, chaveColaboradorInss, cidRaiz, type InssRef } from './atestadosInss';

const r = (over: Partial<InssRef> & { id?: string }): InssRef & { id?: string } => ({
  colaborador_matricula: 'M1',
  colaborador_nome: 'Ana Souza',
  unidade_periodo: 'dias',
  status: 'aprovado',
  cid: 'M54.5',
  ...over,
});

describe('atestadosInss', () => {
  it('cidRaiz e chave do colaborador', () => {
    expect(cidRaiz(' m 54.5 ')).toBe('M54');
    expect(cidRaiz(null)).toBe('');
    expect(chaveColaboradorInss({ colaborador_matricula: ' 77 ', colaborador_nome: 'X' })).toBe('mat:77');
    expect(chaveColaboradorInss({ colaborador_nome: 'João  da Silva' })).toBe('nome:joao da silva');
  });

  it('mantém o alerta isolado > 15 dias com 16º dia a partir do início', () => {
    const a = agruparAlertasInss([r({ data_inicio: '2026-03-01', data_fim: '2026-03-20' })]);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('isolado');
    expect(a[0].dias_acumulados).toBe(20);
    expect(a[0].dia16).toBe('2026-03-16');
  });

  it('soma mesmo CID-raiz em até 60 dias após o fim do anterior', () => {
    const a = agruparAlertasInss([
      r({ id: '1', data_inicio: '2026-01-01', data_fim: '2026-01-10', cid: 'M54.5' }),
      r({ id: '2', data_inicio: '2026-03-01', data_fim: '2026-03-08', cid: 'm54.2' }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('acumulado');
    expect(a[0].dias_acumulados).toBe(18);
    expect(a[0].dia16).toBe('2026-03-06');
    expect(a[0].cid_raiz).toBe('M54');
  });

  it('não soma após 60 dias, com CID-raiz diferente, recusado ou em horas', () => {
    expect(
      agruparAlertasInss([
        r({ data_inicio: '2026-01-01', data_fim: '2026-01-10' }),
        r({ data_inicio: '2026-03-12', data_fim: '2026-03-19' }),
      ]),
    ).toHaveLength(0);
    expect(
      agruparAlertasInss([
        r({ data_inicio: '2026-01-01', data_fim: '2026-01-10' }),
        r({ data_inicio: '2026-01-20', data_fim: '2026-01-27', cid: 'J11' }),
      ]),
    ).toHaveLength(0);
    expect(
      agruparAlertasInss([
        r({ data_inicio: '2026-01-01', data_fim: '2026-01-10' }),
        r({ data_inicio: '2026-01-20', data_fim: '2026-01-27', status: 'recusado' }),
      ]),
    ).toHaveLength(0);
    expect(
      agruparAlertasInss([r({ data_inicio: '2026-01-01', data_fim: '2026-01-20', unidade_periodo: 'horas' })]),
    ).toHaveLength(0);
  });

  it('dias sobrepostos contam uma vez e nome normalizado agrupa sem matrícula', () => {
    const a = agruparAlertasInss([
      r({ colaborador_matricula: null, colaborador_nome: 'José Lima', data_inicio: '2026-05-01', data_fim: '2026-05-10' }),
      r({ colaborador_matricula: null, colaborador_nome: 'jose  lima', data_inicio: '2026-05-05', data_fim: '2026-05-12' }),
    ]);
    expect(a).toHaveLength(0);
    const b = agruparAlertasInss([
      r({ colaborador_matricula: null, colaborador_nome: 'José Lima', data_inicio: '2026-05-01', data_fim: '2026-05-10' }),
      r({ colaborador_matricula: null, colaborador_nome: 'jose lima', data_inicio: '2026-05-05', data_fim: '2026-05-17' }),
    ]);
    expect(b[0].dias_acumulados).toBe(17);
    expect(b[0].dia16).toBe('2026-05-16');
  });

  it('sem CID: só isolado', () => {
    const a = agruparAlertasInss([
      r({ cid: null, data_inicio: '2026-01-01', data_fim: '2026-01-10' }),
      r({ cid: null, data_inicio: '2026-01-15', data_fim: '2026-01-31' }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('isolado');
    expect(a[0].dias_acumulados).toBe(17);
  });
});
