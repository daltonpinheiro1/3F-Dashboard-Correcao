import { describe, expect, it } from 'vitest';
import {
  escolherMotivoOperacional,
  resumoFilaUnica,
  rotuloIccidToutbox,
  stripDedupSuffix,
} from './portabilidadeMotivo';

describe('portabilidadeMotivo', () => {
  it('prefere BKO/Toutbox e ignora dashboard_manual', () => {
    expect(
      escolherMotivoOperacional({
        filas: [
          {
            retorno_motivo: 'dashboard_manual:ops@3f.com',
            resultado_mensagem: 'BKO: sem ICCID após esperas (Toutbox/chip)',
          },
        ],
      }),
    ).toBe('BKO: sem ICCID após esperas (Toutbox/chip)');
  });

  it('corta sufixo dashboard_dedup', () => {
    expect(
      stripDedupSuffix(
        'BKO: sem ICCID após esperas (Toutbox/chip) | dashboard_dedup: duplicata ativa',
      ),
    ).toBe('BKO: sem ICCID após esperas (Toutbox/chip)');
  });

  it('rótulo ICCID no texto Toutbox', () => {
    expect(
      rotuloIccidToutbox(false, 'BKO: sem ICCID após esperas (Toutbox/chip)'),
    ).toBe('não · sem ICCID após esperas (Toutbox/chip)');
    expect(rotuloIccidToutbox(true, 'BKO: sem ICCID')).toBe('sim');
    expect(rotuloIccidToutbox(false, null)).toBe('não');
  });

  it('fila unique por acao:status', () => {
    expect(
      resumoFilaUnica([
        { acao: 'activate', status: 'bko' },
        { acao: 'activate', status: 'bko' },
        { acao: 'consult', status: 'pendente' },
      ]),
    ).toBe('activate:bko, consult:pendente');
  });
});
