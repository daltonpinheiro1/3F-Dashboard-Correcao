import { describe, expect, it } from 'vitest';
import { listaErroDia, listaGrossDia } from './rrKpis';

describe('rrKpis lista', () => {
  it('Gross cap 80', () => {
    const rows = Array.from({ length: 85 }, (_, i) => ({ proposta_id: `p${i}` }));
    expect(listaGrossDia(rows)).toHaveLength(80);
  });

  it('erro só operacional', () => {
    expect(listaErroDia([{ tipos_erro: ['cep'], proposta_id: 'a' }])).toHaveLength(1);
    expect(listaErroDia([{ tipos_erro: ['referencia_tratamento'], proposta_id: 'a' }])).toHaveLength(0);
  });
});
