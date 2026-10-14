import { describe, expect, it } from 'vitest';
import {
  chavePausaRegulamentar,
  consolidarSupervisores,
  diasEntre,
  diasEntreInfo,
  estouroPausaJornada,
  estourosPausa,
  fmtEstouroPausa,
  fmtOperadoresEstourados,
  normalizeEvaCampanhas,
  pausaExcedenteJornada,
  somarPausas,
  type EvaJornada,
  type EvaPausaDetalhe,
  type EvaPayload,
} from './evaDash';

const p = (chave: string, tipo: string, qtd: number, min: number): EvaPausaDetalhe => ({
  chave,
  tipo,
  qtd,
  segundos: Math.round(min * 60),
  media_seg: qtd ? Math.round((min * 60) / qtd) : 0,
});

const jornada = (login: string, detalhe: EvaPausaDetalhe[], sup = 'Sup'): EvaJornada =>
  ({
    id_user: 1,
    user_name: login,
    login,
    supervisor_name: sup,
    campaign_name: 'Port',
    logged_time: 9600,
    pausa_seg: detalhe.reduce((s, d) => s + d.segundos, 0),
    pausas_detalhe: detalhe,
  }) as EvaJornada;

describe('estouro de pausa por ocorrências', () => {
  it('ocorrência a mais é estouro mesmo dentro do tempo', () => {
    const r = estourosPausa([p('alimentacao', 'Alimentação', 2, 18), p('descanso', 'Descanso NR-17', 3, 15)]);
    expect(r.excedente_seg).toBe(0);
    expect(r.estourado).toBe(true);
    const ali = r.estouros.find((e) => e.chave === 'alimentacao')!;
    expect(ali.motivo).toBe('ocorrencias');
    expect(ali.qtd_excedente).toBe(1);
    expect(fmtEstouroPausa(ali)).toBe('Alimentação 2× (máx 1)');
    const desc = r.estouros.find((e) => e.chave === 'descanso')!;
    expect(desc.qtd_excedente).toBe(1);
    expect(desc.motivo).toBe('ocorrencias');
  });

  it('tempo e ocorrências juntos mantêm o excedente de tempo', () => {
    const r = estourosPausa([p('alimentacao', 'Alimentação', 2, 25)]);
    expect(r.excedente_seg).toBe(5 * 60);
    expect(r.estouros[0].motivo).toBe('tempo_ocorrencias');
    expect(fmtEstouroPausa(r.estouros[0])).toBe('Alimentação +5m · 2× (máx 1)');
  });

  it('dentro do limite de ocorrências e tempo não estoura', () => {
    const r = estourosPausa([p('alimentacao', 'Alimentação', 1, 20), p('descanso', 'Descanso', 2, 20)]);
    expect(r.estourado).toBe(false);
    expect(r.estouros).toEqual([]);
  });

  it('estouro só de tempo segue com motivo tempo', () => {
    const r = estourosPausa([p('descanso', 'Descanso', 1, 14)]);
    expect(r.estouros[0].motivo).toBe('tempo');
    expect(r.excedente_seg).toBe(4 * 60);
  });

  it('pausaExcedenteJornada continua só em segundos; estouroPausaJornada marca ocorrência', () => {
    const j = jornada('a', [p('alimentacao', 'Alimentação', 2, 18)]);
    expect(pausaExcedenteJornada(j)).toBe(0);
    expect(estouroPausaJornada(j).estourado).toBe(true);
  });

  it('sem detalhe por tipo cai na meta % do logado', () => {
    const j = { ...jornada('a', []), pausa_seg: 3000, logged_time: 9600 } as EvaJornada;
    const e = estouroPausaJornada(j);
    expect(e.estourado).toBe(true);
    expect(e.excedente_seg).toBe(pausaExcedenteJornada(j));
  });
});

describe('chave de pausa: sinônimos e acentos', () => {
  it('almoço/refeição viram alimentação e intervalo vira descanso', () => {
    expect(chavePausaRegulamentar('almoco', 'Almoço')).toBe('alimentacao');
    expect(chavePausaRegulamentar('outros', 'Refeição')).toBe('alimentacao');
    expect(chavePausaRegulamentar('Alimentação', '')).toBe('alimentacao');
    expect(chavePausaRegulamentar('intervalo', 'Intervalo')).toBe('descanso');
    expect(chavePausaRegulamentar('banheiro', 'Banheiro')).toBe('banheiro');
  });

  it('sinônimo soma no limite regulamentar em vez de cair nas demais pausas', () => {
    const r = estourosPausa([p('almoco', 'Almoço', 1, 15), p('alimentacao', 'Alimentação', 1, 10)]);
    expect(r.estouros.find((e) => e.chave === PAUSA_DEMAIS)).toBeUndefined();
    const ali = r.estouros.find((e) => e.chave === 'alimentacao')!;
    expect(ali.qtd).toBe(2);
    expect(ali.motivo).toBe('tempo_ocorrencias');
    expect(ali.excedente_seg).toBe(5 * 60);
  });
});

const PAUSA_DEMAIS = 'demais';

describe('supervisor: operadores estourados', () => {
  it('conta operadores distintos com estouro de tempo ou ocorrência', () => {
    const rows = consolidarSupervisores([
      jornada('a', [p('alimentacao', 'Alimentação', 2, 18)]),
      jornada('b', [p('descanso', 'Descanso', 1, 15)]),
      jornada('c', [p('descanso', 'Descanso', 1, 5)]),
      jornada('d', [p('alimentacao', 'Alimentação', 2, 10)], 'Outro'),
    ]);
    expect(rows.find((r) => r.supervisor === 'Sup')!.pausa_estourados).toBe(2);
    expect(rows.find((r) => r.supervisor === 'Outro')!.pausa_estourados).toBe(1);
    expect(fmtOperadoresEstourados(1)).toBe('1 operador estourado');
    expect(fmtOperadoresEstourados(3)).toBe('3 operadores estourados');
  });
});

describe('somarPausas', () => {
  it('qtd/segundos ausentes contam como zero', () => {
    const j = jornada('a', [
      { tipo: 'Banheiro', chave: 'banheiro', qtd: undefined as unknown as number, segundos: 60, media_seg: 0 },
      { tipo: 'Banheiro', chave: 'banheiro', qtd: 1, segundos: undefined as unknown as number, media_seg: 0 },
    ]);
    const [b] = somarPausas([j]);
    expect(b.qtd).toBe(1);
    expect(b.segundos).toBe(60);
    expect(Number.isNaN(b.media_seg)).toBe(false);
  });
});

describe('diasEntre', () => {
  it('acima de 31 dias fica com os mais recentes e sinaliza truncado', () => {
    const info = diasEntreInfo('2026-08-01', '2026-10-14');
    expect(info.truncado).toBe(true);
    expect(info.dias).toHaveLength(31);
    expect(info.dias[info.dias.length - 1]).toBe('2026-10-14');
    expect(info.dias[0]).toBe('2026-09-14');
    expect(info.pedidoN).toBe(75);
    expect(diasEntre('2026-08-01', '2026-10-14')).toEqual(info.dias);
  });

  it('dentro do teto não trunca', () => {
    const info = diasEntreInfo('2026-10-01', '2026-10-14');
    expect(info).toEqual({ dias: expect.any(Array), truncado: false, pedidoN: 14 });
    expect(diasEntreInfo('2026-10-14', '2026-10-01').dias).toEqual([]);
  });

  it('ano digitado pela metade conta sem varrer o intervalo e mantém os 31 mais recentes', () => {
    const info = diasEntreInfo('0002-10-14', '2026-10-14');
    expect(info.truncado).toBe(true);
    expect(info.dias).toHaveLength(31);
    expect(info.dias[30]).toBe('2026-10-14');
    expect(info.pedidoN).toBe(739_252);
  });

  it('atravessa virada de mês e ano bissexto', () => {
    expect(diasEntre('2028-02-27', '2028-03-01')).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });
});

describe('ociosidade_hora_camp: OUTROS do sync vira ACAO_BKO', () => {
  it('soma OUTROS na linha BKO da mesma hora quando há operadores BKO', () => {
    const payload = {
      data: '2026-10-14',
      jornada: [{ login: 'bko.op', campaign_name: 'TIM BKO', campanha_op: 'OUTROS' }],
      ociosidade_hora_camp: [
        { hora: '10', campanha_op: 'OUTROS', espera_seg: 100, falando_seg: 300, pct: 25, pessoas: 2, chamadas: 5 },
        { hora: '10', campanha_op: 'ACAO_BKO', espera_seg: 100, falando_seg: 100, pct: 50, pessoas: 1, chamadas: 2 },
        { hora: '11', campanha_op: 'OUTROS', espera_seg: 50, falando_seg: 50, pct: 50, pessoas: 1, chamadas: 1 },
        { hora: '10', campanha_op: 'PORTABILIDADE', espera_seg: 10, falando_seg: 90, pct: 10, pessoas: 3, chamadas: 9 },
      ],
    } as unknown as EvaPayload;
    const out = normalizeEvaCampanhas(payload).ociosidade_hora_camp!;
    const bko10 = out.filter((r) => r.hora === '10' && r.campanha_op === 'ACAO_BKO');
    expect(bko10).toHaveLength(1);
    expect(bko10[0]).toMatchObject({ espera_seg: 200, falando_seg: 400, pessoas: 3, chamadas: 7, pct: 33.3 });
    expect(out.find((r) => r.hora === '11')!.campanha_op).toBe('ACAO_BKO');
    expect(out.some((r) => r.campanha_op === 'OUTROS')).toBe(false);
    expect(out.find((r) => r.campanha_op === 'PORTABILIDADE')!.espera_seg).toBe(10);
  });

  it('sem operadores BKO no dia, OUTROS fica como está', () => {
    const payload = {
      data: '2026-10-14',
      jornada: [{ login: 'port.op', campaign_name: 'Portabilidade', campanha_op: 'PORTABILIDADE' }],
      ociosidade_hora_camp: [{ hora: '10', campanha_op: 'OUTROS', espera_seg: 1, falando_seg: 1, pct: 50 }],
    } as unknown as EvaPayload;
    expect(normalizeEvaCampanhas(payload).ociosidade_hora_camp![0].campanha_op).toBe('OUTROS');
  });
});
