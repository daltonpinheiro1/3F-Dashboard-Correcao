import { describe, expect, it } from 'vitest';
import { parseTextoAtestado } from './atestadosOcrParse';

describe('atestadosOcrParse', () => {
  it('extrai CID, dias, médico e datas de texto OCR', () => {
    const r = parseTextoAtestado(
      'Atestado médico. CID J06.9. Afastamento de 3 dias. Dr. Silva CRM/SP 12345. 01/03/2026 a 03/03/2026.',
    );
    expect(r.cid).toBe('J06.9');
    expect(r.quantidade_dias).toBe(3);
    expect(r.medico_nome).toBe('Silva');
    expect(r.data_fim).toBe('2026-03-03');
    expect(r.requisitos?.periodo).toBe(true);
  });
});
