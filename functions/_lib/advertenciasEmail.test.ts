import { describe, expect, it } from 'vitest';
import {
  buildAdvertenciaNotificacaoCopy,
  classificarMedida,
  extractDecisaoDp,
} from './advertenciasEmail';

describe('advertenciasEmail (notificação automática)', () => {
  it('classifica medida por codigo/label', () => {
    expect(classificarMedida('suspensao_3', 'Suspensão de 3 dias')).toBe('suspensao');
    expect(classificarMedida('advertencia_escrita', 'Advertência Escrita')).toBe('advertencia');
    expect(classificarMedida('advertencia_ou_apuracao_dp', 'Apuração do DP')).toBe('apuracao');
  });

  it('extrai Decisão DP das observações', () => {
    expect(
      extractDecisaoDp('Obs previa\nDecisão DP: elevar para 3 dias por reincidência.\n'),
    ).toBe('elevar para 3 dias por reincidência.');
    expect(extractDecisaoDp('sem decisao')).toBe('');
  });

  it('assunto genérico de suspensão aprovada', () => {
    const c = buildAdvertenciaNotificacaoCopy({
      tipo: 'aprovada',
      colaboradorNome: 'João',
      nivelLabel: 'Suspensão de 1 dia',
      nivelCodigo: 'suspensao_1',
      motivoTexto: 'desidia',
      aprovadoPor: 'DP',
      diasSuspensao: 1,
    });
    expect(c.assunto).toBe('[3F RH] Suspensão aprovada — João');
    expect(c.reformulada).toBe(false);
    expect(c.medidaAtual).toContain('1 dia');
  });

  it('assunto quando DP ajusta para advertência', () => {
    const c = buildAdvertenciaNotificacaoCopy({
      tipo: 'aprovada',
      colaboradorNome: 'Maria',
      nivelLabel: 'Advertência Escrita',
      nivelCodigo: 'advertencia_escrita',
      nivelSolicitadoLabel: 'Suspensão de 3 dias',
      motivoTexto: 'desidia',
      aprovadoPor: 'DP',
      decisaoDp: 'Medida ajustada para advertência escrita.',
    });
    expect(c.assunto).toBe('[3F RH] Medida ajustada e autorizada — Maria');
    expect(c.reformulada).toBe(true);
    expect(c.introText).toMatch(/ajustada/i);
  });

  it('devolução mantém assunto claro', () => {
    const c = buildAdvertenciaNotificacaoCopy({
      tipo: 'recusada',
      colaboradorNome: 'Ana',
      nivelLabel: 'Suspensão de 2 dias',
      nivelCodigo: 'suspensao_2',
      motivoTexto: 'x',
      aprovadoPor: 'DP',
      recusaMotivo: 'Faltam fatos',
    });
    expect(c.assunto).toBe('[3F RH] Solicitação devolvida — Ana');
  });
});
