import { describe, expect, it } from 'vitest';
import type { EvaPayload } from './evaDash';
import { buildRrPeriodo, mergeRrPeriodoPayloads } from './rrPeriodo';

const payload = (data: string, operadores = 1): EvaPayload =>
  ({
    data,
    serie_hora: [
      { hora: '10', campanha_op: 'PORTABILIDADE', total: 10, cpc: 5, sucesso: 2 },
    ],
    jornada: Array.from({ length: operadores }, (_, i) => ({
      login: `op-${i}`,
      supervisor_name: 'SUP A',
      campanha_op: 'PORTABILIDADE',
      tabuladas: 10,
      cpc: 5,
      sucesso: 2,
    })),
  }) as unknown as EvaPayload;

describe('rrPeriodo', () => {
  it('não incorpora live fora da janela histórica', () => {
    const agosto = payload('2026-08-31');
    const liveSetembro = payload('2026-09-08');
    expect(
      mergeRrPeriodoPayloads([agosto], liveSetembro, '2026-08-01', '2026-08-31').map(
        (p) => p.data,
      ),
    ).toEqual(['2026-08-31']);
  });

  it('live dentro da janela substitui o snapshot do mesmo dia', () => {
    const hist = payload('2026-09-08');
    const live = { ...payload('2026-09-08'), updated_at: 'live' } as EvaPayload;
    const merged = mergeRrPeriodoPayloads([hist], live, '2026-09-01', '2026-09-08');
    expect(merged).toHaveLength(1);
    expect(merged[0].updated_at).toBe('live');
  });

  it('meta do supervisor pesa uma vez por dia, não por linha de jornada', () => {
    const opts = {
      campanha: 'PORTABILIDADE' as const,
      metaMensal: 300,
      from: '2026-09-08',
      to: '2026-09-08',
    };
    const umaLinha = buildRrPeriodo({ ...opts, payloads: [payload('2026-09-08', 1)] });
    const dezLinhas = buildRrPeriodo({ ...opts, payloads: [payload('2026-09-08', 10)] });
    expect(dezLinhas.supervisores[0].metaDia).toBe(umaLinha.supervisores[0].metaDia);
  });

  it('ignora payload que esteja fora do intervalo mesmo sem merge prévio', () => {
    const snap = buildRrPeriodo({
      payloads: [payload('2026-08-31'), payload('2026-09-08')],
      campanha: 'PORTABILIDADE',
      metaMensal: 300,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(snap.pontos.map((p) => p.dia)).toEqual(['2026-08-31']);
  });
});
