import { describe, expect, it } from 'vitest';
import { buildAdvertenciaDraft, canPreviewAdvertencia } from './advertenciasDraft';

describe('advertenciasDraft', () => {
  it('canPreview exige motivo e submotivo', () => {
    expect(canPreviewAdvertencia('DESIDIA', 'ATRASOS')).toBe(true);
    expect(canPreviewAdvertencia('', 'X')).toBe(false);
    expect(canPreviewAdvertencia('DESIDIA', '')).toBe(false);
  });

  it('buildAdvertenciaDraft monta cláusula a partir do submotivo', () => {
    const d = buildAdvertenciaDraft({
      nome: 'João Silva',
      matricula: '123',
      cpf: '',
      cargo: 'Operador',
      categoria: 'DESIDIA NO DESEMPENHO DAS FUNCOES',
      submotivo: 'ATRASOS RECORRENTES NA ENTRADA',
      motivoTexto: 'Atrasos Recorrentes Na Entrada',
      descricao: '',
      dataOcorrido: '2026-08-26',
      nivelIdx: 0,
      userName: 'Admin',
      userEmail: 'admin@test.com',
      obs: '',
      supervisorOp: 'Carol',
      justPulo: '',
      ciencia: false,
      t1n: '',
      t1c: '',
      t2n: '',
      t2c: '',
    });
    expect(d.colaborador_nome).toBe('João Silva');
    expect(d.motivo_texto).toContain('Atrasos');
    expect(d.nivel_label).toBe('Feedback Formal');
  });
});
