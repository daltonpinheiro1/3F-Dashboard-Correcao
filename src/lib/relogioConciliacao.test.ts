import { describe, expect, it } from 'vitest';
import { arquivoVencido, relogioCoerente, textoAtraso, type RelogioConciliacao } from './relogioConciliacao';

const base: RelogioConciliacao = {
  gerado_em: '2026-09-27T18:00:00Z',
  arquivo_ref: 'portabilidade_24_09',
  arquivo_em: '2026-09-24',
  oficial_em: '2026-09-27T17:24:36Z',
  sms_em: '2026-09-27T13:26:52Z',
  arquivo_linhas: 3721,
  oficial_os: 8748,
  intersecao: 2475,
  so_arquivo: 1246,
  confianca: { acesso_e_data: 1451, acesso: 1024 },
  divida: 117,
  coerentes: 2189,
  quarentena: 0,
  atraso_sms_horas: 4,
  mudou: { primeiro_arquivo: true, status_mudou: 0, entrou: 3721, saiu: 0 },
  pares: [],
  nota: 'Gross usa a confirmação da consulta de entrega.',
};

describe('relogioCoerente', () => {
  it('aceita a interseção quando os totais fecham', () => {
    expect(relogioCoerente(base)).toBe(true);
  });

  it('recusa dívida maior que a interseção', () => {
    expect(relogioCoerente({ ...base, divida: 9000 })).toBe(false);
  });

  it('recusa confiança que não soma a interseção', () => {
    expect(relogioCoerente({ ...base, confianca: { acesso_e_data: 1, acesso: 1 } })).toBe(false);
  });
});

describe('arquivoVencido', () => {
  it('avisa quando o recorte passa de 7 dias', () => {
    const agora = new Date('2026-10-05T12:00:00Z');
    expect(arquivoVencido('2026-09-27T18:00:00Z', agora)).toBe(true);
    expect(arquivoVencido('2026-10-04T12:00:00Z', agora)).toBe(false);
    expect(arquivoVencido(null, agora)).toBe(true);
  });
});

describe('textoAtraso', () => {
  it('não trata leitura ausente como relógio alinhado', () => {
    expect(textoAtraso(null)).toMatch(/sem leitura/);
    expect(textoAtraso(0)).toMatch(/mesmo horário/);
    expect(textoAtraso(4)).toMatch(/atrasada 4 h/);
    expect(textoAtraso(-2)).toMatch(/mais nova/);
  });
});
