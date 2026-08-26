import { describe, expect, it } from 'vitest';
import {
  isMinhaSolicitacao,
  snapshotDe,
  temAtualizacaoNaoVista,
} from './advertenciasNotificacao';
import type { Advertencia } from './advertenciasEscala';
import { podeConfirmarEntrega, podeMarcarImpressa } from './advertenciasEntrega';

const base: Advertencia = {
  id: '1',
  created_at: '2026-01-01',
  colaborador_nome: 'João',
  motivo_categoria: 'DESIDIA',
  motivo_texto: 'Atrasos',
  descricao: 'x',
  data_ocorrido: '2026-01-01',
  nivel_idx: 5,
  nivel_codigo: 'suspensao_2',
  nivel_label: 'Suspensão 2 dias',
  status: 'pendente',
  criado_por_email: 'sup@test.com',
  entrega_status: 'aguardando_aprovacao',
};

describe('advertenciasNotificacao', () => {
  it('detecta minha solicitação', () => {
    expect(isMinhaSolicitacao(base, 'sup@test.com')).toBe(true);
    expect(isMinhaSolicitacao(base, 'outro@test.com')).toBe(false);
  });

  it('alerta quando status mudou desde última visita', () => {
    const seen = { '1': snapshotDe(base) };
    const aprovada = { ...base, status: 'aprovada' as const, entrega_status: 'aguardando_impressao' as const };
    expect(temAtualizacaoNaoVista(aprovada, 'sup@test.com', seen, true)).toBe(true);
    expect(temAtualizacaoNaoVista(base, 'sup@test.com', seen, true)).toBe(false);
  });
});

describe('advertenciasEntrega', () => {
  it('fluxo impressão → entrega', () => {
    const aprovada = { ...base, status: 'aprovada' as const, entrega_status: 'aguardando_impressao' as const };
    expect(podeMarcarImpressa(aprovada)).toBe(true);
    expect(podeConfirmarEntrega(aprovada)).toBe(false);
    const impressa = { ...aprovada, entrega_status: 'impressa' as const };
    expect(podeConfirmarEntrega(impressa)).toBe(true);
  });
});
