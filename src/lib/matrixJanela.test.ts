import { describe, expect, it } from 'vitest';
import { janelaMatrixDoMes, urlMatrixDoMes } from './matrixJanela';

describe('janelaMatrixDoMes', () => {
  it('mês corrente: dias decorridos até hoje, sem âncora', () => {
    const j = janelaMatrixDoMes('2026-09', '2026-09-28');
    expect(j).toMatchObject({ dias: 28, ate: null, de: '2026-09-01', fim: '2026-09-28', diasFora: 0 });
    expect(j.label).toContain('até agora');
    expect(urlMatrixDoMes(j)).toBe('/api/portabilidade-matrix?dias=28');
  });

  it('dia 1 do mês corrente vira janela de 1 dia', () => {
    expect(janelaMatrixDoMes('2026-10', '2026-10-01')).toMatchObject({ dias: 1, de: '2026-10-01' });
  });

  it('dia 31 do mês corrente respeita teto de 30 e avisa', () => {
    const j = janelaMatrixDoMes('2026-10', '2026-10-31');
    expect(j).toMatchObject({ dias: 30, de: '2026-10-02', diasFora: 1 });
    expect(j.label).toContain('2026-10-01 fora');
  });

  it('mês passado de 31 dias: ancora no último dia, perde o dia 1', () => {
    const j = janelaMatrixDoMes('2026-08', '2026-09-28');
    expect(j).toMatchObject({ dias: 30, ate: '2026-08-31', de: '2026-08-02', fim: '2026-08-31', diasFora: 1 });
    expect(urlMatrixDoMes(j)).toBe('/api/portabilidade-matrix?dias=30&ate=2026-08-31');
  });

  it('fevereiro passado cobre o mês inteiro', () => {
    expect(janelaMatrixDoMes('2026-02', '2026-09-28')).toMatchObject({
      dias: 28,
      ate: '2026-02-28',
      de: '2026-02-01',
      diasFora: 0,
    });
  });

  it('mês futuro ou inválido cai no mês corrente', () => {
    expect(janelaMatrixDoMes('2026-12', '2026-09-28').ate).toBeNull();
    expect(janelaMatrixDoMes('lixo', '2026-09-28').fim).toBe('2026-09-28');
  });
});
