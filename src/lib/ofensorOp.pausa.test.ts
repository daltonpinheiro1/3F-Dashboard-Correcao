import { describe, expect, it } from 'vitest';
import { analisarOperador, fundirJornada } from './ofensorOp';
import {
  calcularPerdas,
  consolidarSupervisores,
  estourosPausa,
  pausaExcedenteJornada,
  type EvaJornada,
  type EvaPausaDetalhe,
} from './evaDash';

const p = (chave: string, tipo: string, qtd: number, min: number): EvaPausaDetalhe => ({
  chave,
  tipo,
  qtd,
  segundos: Math.round(min * 60),
  media_seg: qtd ? Math.round((min * 60) / qtd) : 0,
});

const jornada = (detalhe: EvaPausaDetalhe[], logado = 9600): EvaJornada => {
  const pausa = detalhe.reduce((s, d) => s + d.segundos, 0);
  return {
    id_user: 1,
    user_name: 'Op Teste',
    login: 'op.teste',
    supervisor_name: 'Sup',
    campaign_name: 'Port',
    date_login: '2026-10-14T13:00:00',
    date_logout: null,
    logins: 1,
    logged_time: logado,
    paused_time: pausa,
    pausa_seg: pausa,
    pausa_qtd: detalhe.reduce((s, d) => s + d.qtd, 0),
    pct_pausa: Math.round((10000 * pausa) / logado) / 100,
    acima_meta_pausa: true,
    pausa_excedente_seg: 600,
    relogins: 0,
    keep_alive_abertos: 0,
    tempo_perdido_seg: 0,
    deslogs: [],
    primeiro_login: '2026-10-14T13:00:00',
    atraso_entrada_seg: 0,
    pausas_detalhe: detalhe,
  };
};

describe('pausa: limites por tipo (alimentação 1×20m, descanso 2×10m, demais 8m cada)', () => {
  it('alimentação 19m + descanso 9m no meio do turno não é estouro, mesmo acima de 11,84% do logado', () => {
    const j = jornada([p('alimentacao', 'Alimentação', 1, 19), p('descanso', 'Descanso NR-17', 1, 9)]);
    expect(j.pct_pausa).toBeGreaterThan(11.84);
    expect(estourosPausa(j.pausas_detalhe).excedente_seg).toBe(0);
    expect(pausaExcedenteJornada(j)).toBe(0);
    const a = analisarOperador(j);
    expect(a.focos.some((f) => f.id === 'pausa')).toBe(false);
    expect(a.perdas.tempo_pausa_excedente_seg).toBe(0);
  });

  it('dois descansos somando 20m e outras pausas de até 8m cada ficam dentro', () => {
    const j = jornada([
      p('descanso', 'Descanso NR-17', 2, 20),
      p('banheiro', 'Banheiro', 3, 24),
      p('outros', 'Outros', 1, 8),
    ]);
    expect(pausaExcedenteJornada(j)).toBe(0);
  });

  it('estoura só o que passa do limite do tipo', () => {
    const r = estourosPausa([
      p('alimentacao', 'Alimentação', 1, 25),
      p('descanso', 'Descanso NR-17', 1, 9),
      p('banheiro', 'Banheiro', 1, 9),
    ]);
    expect(r.excedente_seg).toBe(5 * 60 + 60);
    expect(r.estouros.map((e) => e.chave)).toEqual(['alimentacao', 'banheiro']);
  });

  it('ocorrência além do permitido conta inteira como excedente', () => {
    expect(estourosPausa([p('alimentacao', 'Alimentação', 2, 30)]).excedente_seg).toBe(10 * 60);
    expect(estourosPausa([p('descanso', 'Descanso NR-17', 3, 30)]).excedente_seg).toBe(10 * 60);
  });

  it('estouro real vira foco de ofensor com o tipo no detalhe', () => {
    const a = analisarOperador(jornada([p('alimentacao', 'Alimentação', 1, 32)]));
    const foco = a.focos.find((f) => f.id === 'pausa');
    expect(foco?.detalhe).toContain('Alimentação');
    expect(a.perdas.tempo_pausa_excedente_seg).toBe(12 * 60);
  });

  it('fundirJornada recalcula a flag pelos limites, ignorando a do payload', () => {
    const j = fundirJornada([jornada([p('alimentacao', 'Alimentação', 1, 19)])]);
    expect(j?.acima_meta_pausa).toBe(false);
    expect(j?.pausa_excedente_seg).toBe(0);
  });

  it('supervisor soma o excedente de cada operador', () => {
    const [s] = consolidarSupervisores([
      jornada([p('alimentacao', 'Alimentação', 1, 19)]),
      { ...jornada([p('banheiro', 'Banheiro', 1, 10)]), login: 'op.dois', id_user: 2 },
    ]);
    expect(s.pausa_excedente_seg).toBe(120);
  });

  it('sem detalhe por tipo, calcularPerdas mantém a meta % do logado', () => {
    const r = calcularPerdas({ tempoDeslogueSeg: 0, pausaSeg: 3600, logadoSeg: 10000, tmaSeg: 60, tabuladas: 0, sucesso: 0, vb: 0 });
    expect(r.tempo_pausa_excedente_seg).toBeCloseTo(3600 - 1184, 0);
  });
});
