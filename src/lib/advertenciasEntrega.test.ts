import { describe, expect, it } from 'vitest';
import { podeEmitirPdfOficial } from './advertenciasEntrega';

describe('podeEmitirPdfOficial', () => {
  it('bloqueia pendente em qualquer ambiente', () => {
    expect(podeEmitirPdfOficial({ status: 'pendente', nivel_idx: 3 })).toBe(false);
    expect(podeEmitirPdfOficial({ status: 'pendente', nivel_idx: 0 }, { ambiente: 'gestao' })).toBe(
      false,
    );
  });

  it('permite medidas leves aprovadas na gestão', () => {
    expect(
      podeEmitirPdfOficial({ status: 'aprovada', nivel_idx: 0 }, { ambiente: 'gestao' }),
    ).toBe(true);
    expect(
      podeEmitirPdfOficial({ status: 'aprovada', nivel_idx: 2 }, { ambiente: 'gestao' }),
    ).toBe(true);
  });

  it('bloqueia suspensão/apuração na gestão; libera no DP', () => {
    expect(
      podeEmitirPdfOficial({ status: 'aprovada', nivel_idx: 3 }, { ambiente: 'gestao' }),
    ).toBe(false);
    expect(
      podeEmitirPdfOficial({ status: 'aprovada', nivel_idx: 10 }, { ambiente: 'gestao' }),
    ).toBe(false);
    expect(podeEmitirPdfOficial({ status: 'aprovada', nivel_idx: 3 }, { ambiente: 'dp' })).toBe(
      true,
    );
  });
});
