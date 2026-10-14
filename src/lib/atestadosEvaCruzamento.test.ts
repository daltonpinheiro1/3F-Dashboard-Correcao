import { describe, expect, it } from 'vitest';
import { listarCruzamentos, matchJornada } from './atestadosEvaCruzamento';
import type { Atestado } from './atestadosEscala';
import type { EvaJornada, EvaPayload } from './evaDash';

const at = (over: Partial<Atestado>): Atestado =>
  ({
    id: '1',
    protocolo: 'AT-1',
    colaborador_nome: 'Ana Paula Souza',
    colaborador_matricula: null,
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 1,
    status: 'aprovado',
    data_inicio: '2026-03-02',
    created_at: '2026-03-02',
    updated_at: '2026-03-02',
    ...over,
  }) as Atestado;

const jornada = (user_name: string, login = 'x'): EvaJornada =>
  ({ user_name, login, logged_time: 7200 }) as unknown as EvaJornada;

describe('atestadosEvaCruzamento', () => {
  it('casa jornada por palavras completas, sem acentos', () => {
    expect(matchJornada(jornada('ANA PAULA SOUZA LIMA'), at({}))).toBe(true);
    expect(matchJornada(jornada('Ana'), at({}))).toBe(false);
    expect(matchJornada(jornada('Ana Paula'), at({ colaborador_nome: 'Ana Paulá' }))).toBe(true);
    expect(matchJornada(jornada('Ana Paul'), at({ colaborador_nome: 'Ana Paula' }))).toBe(false);
  });

  it('atestado em horas fica fora do cruzamento', () => {
    const map = new Map<string, EvaPayload>([
      ['2026-03-02', { jornada: [jornada('Ana Paula Souza')] } as unknown as EvaPayload],
    ]);
    const itens = listarCruzamentos(
      [at({ id: 'd' }), at({ id: 'h', unidade_periodo: 'horas', quantidade_horas: 2 })],
      map,
      2026,
    );
    expect(itens.map((i) => i.atestado.id)).toEqual(['d']);
    expect(itens[0].resumo).toBe('alerta');
  });
});
