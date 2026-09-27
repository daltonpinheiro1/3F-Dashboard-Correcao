import { describe, expect, it } from 'vitest';
import {
  execucoesDoMes,
  diasBrtEntre,
  inicioDiaBrtMenos,
  lerSnapshotsDias,
  MAX_DIAS_AVULSOS,
  parseSnapshotDia,
  somarSnapshots,
} from './disparosSnapshot';

describe('disparosSnapshot', () => {
  it('lista dias BRT do mês a partir dos limites 03:00Z', () => {
    expect(diasBrtEntre('2026-09-01T03:00:00.000Z', '2026-09-04T03:00:00.000Z')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('cutoff live = 00:00 BRT de hoje−N (madrugada UTC ainda é ontem em BRT)', () => {
    const agora = new Date('2026-09-27T02:00:00Z');
    expect(inicioDiaBrtMenos(agora, 5)).toBe('2026-09-21T03:00:00.000Z');
  });

  it('mês corrente: dias antigos do snapshot, recentes ao vivo, sem sobreposição', async () => {
    let diasPedidos: string[] = [];
    const ranges: string[] = [];
    const ex = await execucoesDoMes({
      start: '2026-09-01T03:00:00.000Z',
      end: '2026-10-01T03:00:00.000Z',
      agora: new Date('2026-09-27T15:00:00Z'),
      lerDias: async (dias) => {
        diasPedidos = dias;
        const snaps = dias.map((dia) => parseSnapshotDia({ dia, exec_ok: 1, exec_nok: 1 }, dia));
        return somarSnapshots(dias, snaps);
      },
      contar: async (p) => {
        ranges.push(p.and);
        return 10;
      },
    });
    expect(diasPedidos[0]).toBe('2026-09-01');
    expect(diasPedidos[diasPedidos.length - 1]).toBe('2026-09-21');
    expect(ranges.every((r) => r.startsWith('(executed_at.gte.2026-09-22T03:00:00.000Z'))).toBe(true);
    expect(ex.exec_ok).toBe(10 + 21);
    expect(ex.completa).toBe(true);
  });

  it('mês fechado antigo: não consulta a fila ao vivo', async () => {
    let chamadas = 0;
    const ex = await execucoesDoMes({
      start: '2026-08-01T03:00:00.000Z',
      end: '2026-09-01T03:00:00.000Z',
      agora: new Date('2026-09-27T15:00:00Z'),
      lerDias: async (dias) => somarSnapshots(dias, dias.map(() => null)),
      contar: async () => {
        chamadas += 1;
        return 5;
      },
    });
    expect(chamadas).toBe(0);
    expect(ex.completa).toBe(false);
    expect(ex.dias_sem_snapshot).toHaveLength(31);
  });

  it('rejeita snapshot de outro dia e soma só os válidos', () => {
    const ok = parseSnapshotDia(
      { dia: '2026-09-10', exec_ok: 10, exec_nok: 2, por_acao: { consult: { concluidas: 8, enfileiradas: 9 } } },
      '2026-09-10',
    );
    const errado = parseSnapshotDia({ dia: '2026-09-09', exec_ok: 99 }, '2026-09-11');
    expect(errado).toBeNull();
    const soma = somarSnapshots(['2026-09-10', '2026-09-11'], [ok, errado]);
    expect(soma.exec_ok).toBe(10);
    expect(soma.por_acao.consult.concluidas).toBe(8);
    expect(soma.por_acao.cancel.concluidas).toBe(0);
    expect(soma.dias_sem_snapshot).toEqual(['2026-09-11']);
  });

  const env = {} as never;
  const snap = (dia: string) => ({ dia, exec_ok: 1, exec_nok: 0 });

  it('mês inteiro sai do arquivo mensal em 1 requisição (limite de subrequests)', async () => {
    const pedidos: string[] = [];
    const dias = diasBrtEntre('2026-09-01T03:00:00.000Z', '2026-09-22T03:00:00.000Z');
    const soma = await lerSnapshotsDias(env, dias, async (obj) => {
      pedidos.push(obj);
      return obj === 'mes-2026-09.json'
        ? { dias: Object.fromEntries(dias.map((d) => [d, snap(d)])) }
        : null;
    });
    expect(pedidos).toEqual(['mes-2026-09.json']);
    expect(soma.exec_ok).toBe(21);
    expect(soma.dias_sem_snapshot).toEqual([]);
  });

  it('sem arquivo mensal: busca só os últimos MAX_DIAS_AVULSOS dias avulsos', async () => {
    const pedidos: string[] = [];
    const dias = diasBrtEntre('2026-09-01T03:00:00.000Z', '2026-09-22T03:00:00.000Z');
    const soma = await lerSnapshotsDias(env, dias, async (obj) => {
      pedidos.push(obj);
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(obj);
      return m ? snap(m[1]) : null;
    });
    expect(pedidos).toHaveLength(1 + MAX_DIAS_AVULSOS);
    expect(soma.dias_lidos).toEqual(dias.slice(-MAX_DIAS_AVULSOS));
    expect(soma.dias_sem_snapshot).toHaveLength(21 - MAX_DIAS_AVULSOS);
  });

  it('mês parcial no arquivo: completa com avulsos; virada de mês lê os dois arquivos', async () => {
    const pedidos: string[] = [];
    const dias = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'];
    const soma = await lerSnapshotsDias(env, dias, async (obj) => {
      pedidos.push(obj);
      if (obj === 'mes-2026-08.json') return { dias: { '2026-08-30': snap('2026-08-30') } };
      if (obj === 'mes-2026-09.json') return { dias: { '2026-09-01': snap('2026-09-01'), '2026-09-02': snap('2026-09-02') } };
      if (obj === '2026-08-31.json') return snap('2026-08-31');
      return null;
    });
    expect(pedidos.sort()).toEqual(['2026-08-31.json', 'mes-2026-08.json', 'mes-2026-09.json']);
    expect(soma.dias_lidos).toEqual(dias);
  });
});
