import { describe, expect, it } from 'vitest';
import {
  buildPgListPath,
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  filtrarRowsAdvertencias,
  isBeforeCursor,
  isIsoDay,
  paginateRows,
  parseAdvertenciasListFiltros,
  sanitizeAdvertenciaStatus,
  temFiltrosAdvertencias,
} from './advertenciasList';

function parse(qs: string) {
  return parseAdvertenciasListFiltros(new URLSearchParams(qs));
}

describe('advertenciasList (filtros de recorte)', () => {
  it('isIsoDay aceita só datas reais AAAA-MM-DD', () => {
    expect(isIsoDay('2026-02-28')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-2-1')).toBe(false);
    expect(isIsoDay('2026-02-01);drop')).toBe(false);
  });

  it('parse valida de/ate, período invertido, nivel e tamanho do texto', () => {
    expect(parse('de=2026-13-01').ok).toBe(false);
    expect(parse('ate=ontem').ok).toBe(false);
    expect(parse('de=2026-03-10&ate=2026-03-01').ok).toBe(false);
    expect(parse('nivel=11').ok).toBe(false);
    expect(parse('nivel=eq.3').ok).toBe(false);
    expect(parse(`colaborador=${'a'.repeat(81)}`).ok).toBe(false);
    const ok = parse('de=2026-03-01&ate=2026-03-31&colaborador=%20Jo(ão)*%25&nivel=3&criticos=1');
    expect(ok).toEqual({
      ok: true,
      filtros: { de: '2026-03-01', ate: '2026-03-31', colaborador: 'João', nivel: 3, criticos: true },
    });
  });

  it('colaborador com menos de 2 caracteres úteis é ignorado', () => {
    const r = parse('colaborador=*a*');
    expect(r.ok && r.filtros.colaborador).toBeNull();
    expect(r.ok && temFiltrosAdvertencias(r.filtros)).toBe(false);
  });

  it('buildPgListPath soma filtros ao escopo sem usar o `or` do cursor', () => {
    const cursor = decodeListCursor(btoa('2026-08-27T10:00:00.000Z\nok-id'));
    const path = buildPgListPath({
      limit: 10,
      cursor,
      criado_por_email: 'sup@3f.com',
      filtros: { de: '2026-03-01', ate: '2026-03-31', colaborador: 'Ana', nivel: 3, criticos: false },
    });
    const q = new URLSearchParams(path.split('?')[1]);
    expect(q.get('criado_por_email')).toBe('eq.sup@3f.com');
    expect(q.get('or')).toContain('created_at.lt.');
    expect(q.get('and')).toBe(
      '(data_ocorrido.gte.2026-03-01,data_ocorrido.lte.2026-03-31,or(colaborador_nome.ilike.*Ana*,colaborador_matricula.ilike.*Ana*,colaborador_supervisor.ilike.*Ana*,observacoes_supervisor.ilike.*Ana*,criado_por_nome.ilike.*Ana*))',
    );
    expect(q.get('nivel_idx')).toBe('eq.3');
  });

  it('buildPgListPath: críticos vence nível e texto malicioso é neutralizado', () => {
    const path = buildPgListPath({
      limit: 10,
      cursor: null,
      filtros: { de: null, ate: null, colaborador: 'x),status.eq.aprovada', nivel: 2, criticos: true },
    });
    const q = new URLSearchParams(path.split('?')[1]);
    expect(q.get('nivel_idx')).toBe('gte.9');
    expect(q.get('and')).not.toMatch(/\),status/);
    expect(q.get('status')).toBeNull();
  });

  it('filtrarRowsAdvertencias (fallback) segue a mesma semântica', () => {
    const rows = [
      { id: '1', data_ocorrido: '2026-03-05', nivel_idx: 3, colaborador_nome: 'Ana Souza' },
      { id: '2', data_ocorrido: '2026-04-05', nivel_idx: 9, colaborador_nome: 'Bruno', colaborador_supervisor: 'Ana Lima' },
      { id: '3', data_ocorrido: '2026-03-20', nivel_idx: 10, colaborador_nome: 'Carla' },
    ];
    const base = { de: null, ate: null, colaborador: null, nivel: null, criticos: false };
    expect(filtrarRowsAdvertencias(rows, { ...base, de: '2026-03-01', ate: '2026-03-31' }).map((r) => r.id)).toEqual(['1', '3']);
    expect(filtrarRowsAdvertencias(rows, { ...base, colaborador: 'ana' }).map((r) => r.id)).toEqual(['1', '2']);
    expect(filtrarRowsAdvertencias(rows, { ...base, criticos: true, nivel: 3 }).map((r) => r.id)).toEqual(['2', '3']);
    expect(filtrarRowsAdvertencias(rows, { ...base, nivel: 3 }).map((r) => r.id)).toEqual(['1']);
  });
});

describe('advertenciasList (cursor)', () => {
  it('encode/decode roundtrip', () => {
    const c = { created_at: '2026-08-27T10:00:00.000Z', id: 'abc-123' };
    expect(decodeListCursor(encodeListCursor(c))).toEqual(c);
    expect(decodeListCursor('%%%')).toBeNull();
  });

  it('clampListLimit respeita teto', () => {
    expect(clampListLimit(null)).toBe(200);
    expect(clampListLimit('50')).toBe(50);
    expect(clampListLimit('9999')).toBe(500);
    expect(clampListLimit('-1')).toBe(200);
  });

  it('paginateRows keyset DESC', () => {
    const rows = [
      { id: 'c', created_at: '2026-03-01T00:00:00Z' },
      { id: 'b', created_at: '2026-02-01T00:00:00Z' },
      { id: 'a', created_at: '2026-01-01T00:00:00Z' },
    ];
    const p1 = paginateRows(rows, null, 2);
    expect(p1.rows.map((r) => r.id)).toEqual(['c', 'b']);
    expect(p1.has_more).toBe(true);
    expect(p1.next_cursor).toBeTruthy();

    const cur = decodeListCursor(p1.next_cursor);
    expect(cur).toEqual({ created_at: '2026-02-01T00:00:00Z', id: 'b' });
    const p2 = paginateRows(rows, cur, 2);
    expect(p2.rows.map((r) => r.id)).toEqual(['a']);
    expect(p2.has_more).toBe(false);
    expect(p2.next_cursor).toBeNull();
  });

  it('isBeforeCursor', () => {
    const cur = { created_at: '2026-02-01T00:00:00Z', id: 'b' };
    expect(isBeforeCursor({ created_at: '2026-01-01T00:00:00Z', id: 'a' }, cur)).toBe(true);
    expect(isBeforeCursor({ created_at: '2026-03-01T00:00:00Z', id: 'c' }, cur)).toBe(false);
    expect(isBeforeCursor({ created_at: '2026-02-01T00:00:00Z', id: 'a' }, cur)).toBe(true);
  });

  it('buildPgListPath escopa criado_por_email (viewer/supervisor)', () => {
    const path = buildPgListPath({
      limit: 50,
      cursor: null,
      criado_por_email: 'sup@3f.com',
    });
    expect(path).toContain('criado_por_email=eq.sup%403f.com');
    expect(buildPgListPath({ limit: 10, cursor: null })).not.toContain('criado_por_email');
  });

  it('decodeListCursor rejeita injeção PostgREST', () => {
    const evil = btoa('2026-08-27T10:00:00.000Z\nabc);status=eq.aprovada');
    expect(decodeListCursor(evil)).toBeNull();
    const quoted = btoa('2026-08-27T10:00:00.000Z","status.eq.aprovada\nid-1');
    expect(decodeListCursor(quoted)).toBeNull();
    const path = buildPgListPath({
      limit: 10,
      cursor: decodeListCursor(btoa('2026-08-27T10:00:00.000Z\nok-id')),
      criado_por_email: 'sup@3f.com',
    });
    expect(path).toContain('criado_por_email=eq.sup%403f.com');
    expect(path).toContain('created_at.lt.');
  });

  it('sanitizeAdvertenciaStatus allowlist (anti filter injection)', () => {
    expect(sanitizeAdvertenciaStatus('aprovada')).toBe('aprovada');
    expect(sanitizeAdvertenciaStatus('PENDENTE')).toBe('pendente');
    expect(sanitizeAdvertenciaStatus('eq.aprovada,id.neq.0')).toBeNull();
    expect(sanitizeAdvertenciaStatus('')).toBeNull();
    const path = buildPgListPath({ limit: 10, cursor: null, status: 'aprovada);drop' });
    expect(path).not.toContain('status=eq.');
  });
});
