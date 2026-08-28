import { describe, expect, it } from 'vitest';
import { buildDecisaoEmail, buildProtocoloEmail } from './atestadosEmail';

describe('atestadosEmail', () => {
  it('buildProtocoloEmail inclui protocolo e colaborador', () => {
    const copy = buildProtocoloEmail({
      protocolo: 'AT-2026-ABC123',
      colaboradorNome: 'João Silva',
      tipo: 'medico',
      periodo: '3 dia(s)',
      protocoladoPor: 'Maria DP',
      arquivoPath: 'atestados-local/testes/2026/08/28/joao_silva_AT-2026-ABC123.jpg',
    });
    expect(copy.assunto).toContain('AT-2026-ABC123');
    expect(copy.assunto).toContain('João Silva');
    expect(copy.html).toContain('atestados-local/testes');
  });

  it('buildDecisaoEmail diferencia aprovado e recusado', () => {
    const a = buildDecisaoEmail({
      protocolo: 'AT-2026-X',
      colaboradorNome: 'Ana',
      status: 'aprovado',
      analisadoPor: 'DP',
    });
    const r = buildDecisaoEmail({
      protocolo: 'AT-2026-X',
      colaboradorNome: 'Ana',
      status: 'recusado',
      analisadoPor: 'DP',
      recusaMotivo: 'CID ilegível',
    });
    expect(a.assunto).toContain('aprovado');
    expect(r.text).toContain('CID ilegível');
  });
});
