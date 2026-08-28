import { describe, expect, it } from 'vitest';
import { buildFieldScores } from './atestadosFieldScores';

describe('atestadosFieldScores', () => {
  it('marca campos preenchidos com score alto', () => {
    const scores = buildFieldScores(
      {
        confianca: 0.9,
        requisitos: { cid: true, periodo: true, nome_medico: true, crm: true, tipo_documento: true, assinatura_carimbo: true, nome_paciente: true },
      },
      {
        dataInicio: '2026-08-28',
        dataFim: '2026-08-30',
        qtdDias: '3',
        qtdHoras: '',
        cid: 'J06.9',
        medico: 'Silva',
        crm: '123/SP',
        unidade: 'dias',
      },
    );
    expect(scores.find((s) => s.key === 'cid')?.status).toBe('ok');
    expect(scores.find((s) => s.key === 'cid')!.score).toBeGreaterThan(80);
  });
});
