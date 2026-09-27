import { describe, expect, it } from 'vitest';
import { agEntraNoUniverso, ordenarComo } from '../api/portabilidade-funil';
import { FUNIL_IDADE_MAX_MS, funilFresco, objFunil, particionarFunil } from './funilSnapshot';

describe('funilSnapshot', () => {
  const agora = Date.parse('2026-09-27T20:00:00Z');

  it('aceita arquivo da VM até o limite de idade e recusa velho, futuro ou sem data', () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    expect(funilFresco({ gerado_em: iso(agora - FUNIL_IDADE_MAX_MS) }, agora)).toBe(true);
    expect(funilFresco({ gerado_em: iso(agora - FUNIL_IDADE_MAX_MS - 1) }, agora)).toBe(false);
    expect(funilFresco({ gerado_em: iso(agora + 10 * 60_000) }, agora)).toBe(false);
    expect(funilFresco({}, agora)).toBe(false);
    expect(funilFresco(null, agora)).toBe(false);
  });

  it('caminho por mês/modo/arquivo', () => {
    expect(objFunil('2026-09', 'operacional', 'fatia-bko')).toBe(
      'portabilidade/funil/2026-09/operacional/fatia-bko.json',
    );
  });

  it('particiona: resumo sem itens e toda fatia do meta tem arquivo, mesmo vazia', () => {
    const built = {
      gerado_em: '2026-09-27T20:00:00Z',
      periodo: { mes: '2026-09' },
      reconciliacao: { universo: 3 },
      meta: { bko: {}, orfao: {}, pre_os: {} },
      _items: [
        { proposta: 'a', fatia: 'bko' },
        { proposta: 'b', fatia: 'bko' },
        { proposta: 'c', fatia: 'orfao' },
      ],
    };
    const { resumo, fatias } = particionarFunil(built);
    expect('_items' in resumo).toBe(false);
    expect(Object.keys(fatias).sort()).toEqual(['bko', 'orfao', 'pre_os']);
    expect(fatias.bko.items.map((i) => i.proposta)).toEqual(['a', 'b']);
    expect(fatias.pre_os.items).toEqual([]);
    expect(fatias.orfao.reconciliacao).toEqual({ universo: 3 });
    expect(fatias.orfao.gerado_em).toBe(built.gerado_em);
  });
});

describe('agEntraNoUniverso', () => {
  const ini = '2026-09-01T03:00:00.000Z';
  const fim = '2026-10-01T03:00:00.000Z';

  it('logística em andamento entra sempre', () => {
    expect(agEntraNoUniverso({ status: 'monitorando', updated_at: '2026-07-01T00:00:00Z' }, ini, fim)).toBe(true);
    expect(agEntraNoUniverso({ status: 'acao_enviada', updated_at: null }, ini, fim)).toBe(true);
  });

  it('quebra só entra no mês em que aconteceu (a tabela guarda a história toda)', () => {
    expect(agEntraNoUniverso({ status: 'quebra_logistica', updated_at: '2026-09-10T12:00:00+00:00' }, ini, fim)).toBe(true);
    expect(agEntraNoUniverso({ status: 'quebra_logistica', updated_at: '2026-08-31T23:00:00+00:00' }, ini, fim)).toBe(false);
    expect(agEntraNoUniverso({ status: 'quebra_logistica', updated_at: '2026-10-01T03:00:00+00:00' }, ini, fim)).toBe(false);
    expect(agEntraNoUniverso({ status: 'quebra_logistica', updated_at: null }, ini, fim)).toBe(false);
  });
});

describe('ordenarComo', () => {
  const rows = [
    { id: 1, t: null },
    { id: 2, t: '2026-09-10T10:00:00+00:00' },
    { id: 3, t: '2026-09-12T10:00:00.000Z' },
    { id: 4, t: '2026-09-10T10:00:00+00:00' },
  ];

  it('desc.nullslast como o PostgREST, empate preserva a ordem por id', () => {
    expect(ordenarComo(rows, 't.desc.nullslast').map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });

  it('sem nulls explícito segue o padrão do Postgres (desc = nulos primeiro)', () => {
    expect(ordenarComo(rows, 't.desc').map((r) => r.id)).toEqual([1, 3, 2, 4]);
    expect(ordenarComo(rows, 't.asc').map((r) => r.id)).toEqual([2, 4, 3, 1]);
  });
});
