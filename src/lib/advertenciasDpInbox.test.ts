import { describe, expect, it } from 'vitest';
import type { Advertencia } from './advertenciasEscala';
import {
  ADVERTENCIAS_MAIN_TABS,
  contarDpInbox,
  isAutorizadaAberta,
  isEnviadaDp,
  isRecebida,
  inboxFiltroForRow,
  matchDpInbox,
  parseDpInboxParam,
} from './advertenciasDpInbox';

function row(partial: Partial<Advertencia>): Advertencia {
  return {
    id: '1',
    colaborador_nome: 'Teste',
    motivo_categoria: 'DESIDIA',
    motivo_texto: 'x',
    descricao: 'y',
    data_ocorrido: '2026-01-01',
    nivel_idx: 0,
    nivel_codigo: 'feedback',
    nivel_label: 'Feedback',
    dias_suspensao: 0,
    status: 'pendente',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('advertenciasDpInbox', () => {
  it('mantém Criação + Acompanhamento nas abas de Advertências (anti-regressão)', () => {
    expect(ADVERTENCIAS_MAIN_TABS).toHaveLength(2);
    expect(ADVERTENCIAS_MAIN_TABS.map((t) => t.id)).toEqual(['criacao', 'acompanhamento']);
    expect(ADVERTENCIAS_MAIN_TABS.some((t) => t.label === 'Acompanhamento')).toBe(true);
  });

  it('classifica enviadas (suspensão/apuração pendente)', () => {
    expect(isEnviadaDp(row({ nivel_idx: 3, dias_suspensao: 1, nivel_codigo: 'suspensao_1' }))).toBe(true);
    expect(isEnviadaDp(row({ nivel_idx: 10, dias_suspensao: 0, nivel_codigo: 'advertencia_ou_apuracao_dp' }))).toBe(
      true,
    );
    expect(isEnviadaDp(row({ nivel_idx: 0, status: 'pendente' }))).toBe(false);
  });

  it('autorizadas abertas vs recebidas', () => {
    const aut = row({ status: 'aprovada', entrega_status: 'aguardando_impressao' });
    expect(isAutorizadaAberta(aut)).toBe(true);
    expect(isRecebida(aut)).toBe(false);

    const rec = row({ status: 'aprovada', entrega_status: 'entregue' });
    expect(isAutorizadaAberta(rec)).toBe(false);
    expect(isRecebida(rec)).toBe(true);
  });

  it('contarDpInbox soma buckets exclusivos', () => {
    const rows = [
      row({ id: 'a', nivel_idx: 3, dias_suspensao: 1, status: 'pendente' }),
      row({ id: 'b', status: 'aprovada', entrega_status: 'impressa' }),
      row({ id: 'c', status: 'recusada' }),
      row({ id: 'd', status: 'aprovada', entrega_status: 'entregue' }),
      row({ id: 'e', nivel_idx: 0, status: 'aprovada', entrega_status: 'aguardando_impressao' }),
    ];
    const c = contarDpInbox(rows);
    expect(c.todas).toBe(5);
    expect(c.enviadas).toBe(1);
    expect(c.autorizadas).toBe(2);
    expect(c.recusadas).toBe(1);
    expect(c.recebidas).toBe(1);
  });

  it('match + parse param', () => {
    expect(matchDpInbox(row({ status: 'recusada' }), 'recusadas')).toBe(true);
    expect(parseDpInboxParam('enviadas')).toBe('enviadas');
    expect(parseDpInboxParam('xyz')).toBe('todas');
  });

  it('inboxFiltroForRow alinha deep link à fila correta', () => {
    expect(
      inboxFiltroForRow(row({ nivel_idx: 3, dias_suspensao: 1, status: 'pendente' })),
    ).toBe('enviadas');
    expect(
      inboxFiltroForRow(row({ status: 'aprovada', entrega_status: 'aguardando_impressao' })),
    ).toBe('autorizadas');
    expect(inboxFiltroForRow(row({ status: 'recusada' }))).toBe('recusadas');
    expect(
      inboxFiltroForRow(row({ status: 'aprovada', entrega_status: 'entregue' })),
    ).toBe('recebidas');
  });
});
