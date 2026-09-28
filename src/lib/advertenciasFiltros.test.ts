import { describe, expect, it } from 'vitest';
import type { Advertencia } from './advertenciasEscala';
import {
  colaboradorCasa,
  contarInboxFaceted,
  filtrarAdvertencias,
  kpisAdvertenciasRecorte,
  recorteServidorAdvertencias,
  rotuloPeriodoAdvertencias,
  temRecorteServidor,
  type AdvertenciasFiltrosUi,
} from './advertenciasFiltros';

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

const SEM_FILTRO: AdvertenciasFiltrosUi = {
  inbox: 'todas',
  minhas: false,
  status: '',
  colab: '',
  nivel: '',
  criticos: false,
  de: '',
  ate: '',
};

const ME = 'eu@3f.com';

const rows: Advertencia[] = [
  // enviada (suspensão pendente), minha, março
  row({ id: 'a', nivel_idx: 3, status: 'pendente', criado_por_email: ME, colaborador_nome: 'Ana', data_ocorrido: '2026-03-05' }),
  // autorizada aberta, crítica, março
  row({ id: 'b', nivel_idx: 9, status: 'aprovada', colaborador_nome: 'Bruno', data_ocorrido: '2026-03-10' }),
  // recebida, minha, abril
  row({ id: 'c', nivel_idx: 2, status: 'aprovada', entrega_status: 'entregue', criado_por_email: ME, colaborador_nome: 'Carla', data_ocorrido: '2026-04-02' }),
  // recusada, março
  row({ id: 'd', nivel_idx: 5, status: 'recusada', colaborador_nome: 'Davi', colaborador_supervisor: 'Ana Lima', data_ocorrido: '2026-03-20' }),
];

describe('advertenciasFiltros', () => {
  it('filtrarAdvertencias aplica todos os filtros e respeita facetas excluídas', () => {
    const f = { ...SEM_FILTRO, inbox: 'enviadas' as const, minhas: true };
    expect(filtrarAdvertencias(rows, f, ME).map((r) => r.id)).toEqual(['a']);
    expect(filtrarAdvertencias(rows, f, ME, ['inbox']).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filtrarAdvertencias(rows, f, ME, ['minhas']).map((r) => r.id)).toEqual(['a']);
  });

  it('contador faceted de cada fila bate com o que aparece ao clicar nela', () => {
    const f = { ...SEM_FILTRO, inbox: 'recusadas' as const, de: '2026-03-01', ate: '2026-03-31' };
    const counts = contarInboxFaceted(rows, f, ME);
    expect(counts).toEqual({ todas: 3, enviadas: 1, autorizadas: 1, recusadas: 1, recebidas: 0 });
    for (const fila of ['enviadas', 'autorizadas', 'recusadas', 'recebidas'] as const) {
      expect(filtrarAdvertencias(rows, { ...f, inbox: fila }, ME)).toHaveLength(counts[fila]);
    }
  });

  it('contador ignora a própria fila, mas não os demais filtros (nome)', () => {
    const counts = contarInboxFaceted(rows, { ...SEM_FILTRO, inbox: 'enviadas', colab: 'ana' }, ME);
    // "ana" casa Ana (colaborador) e Davi (gestor Ana Lima)
    expect(counts.todas).toBe(2);
    expect(counts.recusadas).toBe(1);
    expect(counts.enviadas).toBe(1);
  });

  it('colaboradorCasa usa a mesma limpeza do servidor e casa campo a campo', () => {
    const r = row({ colaborador_nome: 'Ana Souza', colaborador_matricula: '123' });
    expect(colaboradorCasa(r, ' ana* ')).toBe(true);
    expect(colaboradorCasa(r, '123')).toBe(true);
    expect(colaboradorCasa(r, 'Souza 123')).toBe(false);
  });

  it('KPIs saem das linhas filtradas; com período conta pela data do ocorrido', () => {
    const agora = new Date('2026-03-15T15:00:00Z');
    const marco = filtrarAdvertencias(rows, { ...SEM_FILTRO, de: '2026-03-01', ate: '2026-03-31' }, ME);
    const k = kpisAdvertenciasRecorte(marco, { de: '2026-03-01', ate: '2026-03-31' }, agora);
    expect(k.noPeriodo).toBe(3);
    expect(k.periodoLabel).toBe('no período 01/03/2026 a 31/03/2026');
    expect(k.criticos).toBe(1);
    const soAbril = filtrarAdvertencias(rows, { ...SEM_FILTRO, de: '2026-04-01' }, ME);
    expect(kpisAdvertenciasRecorte(soAbril, { de: '2026-04-01', ate: '' }, agora).criticos).toBe(0);
  });

  it('sem período mantém o mês corrente com rótulo explícito', () => {
    const agora = new Date('2026-03-15T15:00:00Z');
    const lista = [
      row({ id: 'x', created_at: '2026-03-02T12:00:00Z' }),
      row({ id: 'y', created_at: '2026-02-27T12:00:00Z' }),
    ];
    const k = kpisAdvertenciasRecorte(lista, { de: '', ate: '' }, agora);
    expect(k.noPeriodo).toBe(1);
    expect(k.periodoLabel).toBe('no mês corrente (03/2026)');
    expect(rotuloPeriodoAdvertencias('2026-01-01', '', agora)).toBe('desde 01/01/2026');
    expect(rotuloPeriodoAdvertencias('', '2026-01-31', agora)).toBe('até 31/01/2026');
  });

  it('recorteServidorAdvertencias só envia parâmetros válidos', () => {
    expect(temRecorteServidor(recorteServidorAdvertencias(SEM_FILTRO))).toBe(false);
    const r = recorteServidorAdvertencias({
      ...SEM_FILTRO,
      status: 'aprovada',
      colab: ' Jo(ão)* ',
      nivel: '3',
      de: '2026-03-01',
      ate: '2026-03-31',
    });
    expect(r).toEqual({
      status: 'aprovada',
      de: '2026-03-01',
      ate: '2026-03-31',
      colaborador: 'João',
      nivel: '3',
      criticos: false,
    });
    const invertido = recorteServidorAdvertencias({ ...SEM_FILTRO, de: '2026-04-01', ate: '2026-03-01' });
    expect(invertido.de).toBeNull();
    expect(invertido.ate).toBeNull();
    const crit = recorteServidorAdvertencias({ ...SEM_FILTRO, criticos: true, nivel: '3', colab: 'a' });
    expect(crit.nivel).toBeNull();
    expect(crit.colaborador).toBeNull();
    expect(temRecorteServidor(crit)).toBe(true);
  });
});
