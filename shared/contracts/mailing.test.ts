import { describe, expect, it } from 'vitest';
import { parseMailingSaude } from './mailing';

const base = () => ({
  versao: 1,
  data: '2026-10-14',
  updated_at: '2026-10-14T12:00:00Z',
  definicoes: {},
  resumo: {},
  curva: [],
  distribuicao: [],
  serie_hora: [],
  serie_dia: [],
  mailings: [{ id: 1, hoje: {}, propensao: {} }],
  recomendacoes: [],
});

describe('parseMailingSaude · PII', () => {
  it('snapshot limpo passa', () => {
    expect(parseMailingSaude(base()).ok).toBe(true);
  });

  it.each(['por_regiao', 'por_regiao_mailing', 'politica_regiao', 'recomendacoes', 'serie_hora'])(
    'telefone em %s é bloqueado (antes só mailings era checado)',
    (lista) => {
      const p = { ...base(), [lista]: [{ regiao: 'SP', phone_number: '11999999999' }] };
      const r = parseMailingSaude(p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(lista);
    },
  );

  it('continua bloqueando PII em mailings', () => {
    const p = { ...base(), mailings: [{ id: 1, hoje: {}, propensao: {}, cpf: '1' }] };
    expect(parseMailingSaude(p).ok).toBe(false);
  });
});
