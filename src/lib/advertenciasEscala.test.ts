import { describe, expect, it } from 'vitest';
import {
  podeAvancarNivel,
  sugerirProximoNivel,
  sugerirReintegracao,
  escalaCritica,
  nivelPorIdx,
  requerAprovacaoDp,
  TEXTO_MODELO_OFICIAL,
} from './advertenciasEscala';
import { submotivosDoMotivo, SISCAD_MOTIVOS } from './siscadMotivos';

describe('escala pedagógica', () => {
  it('sem histórico sugere Feedback Formal', () => {
    expect(sugerirProximoNivel([])).toBe(0);
    expect(nivelPorIdx(0).label).toBe('Feedback Formal');
  });

  it('após feedback sugere advertência verbal', () => {
    expect(sugerirProximoNivel([0])).toBe(1);
  });

  it('bloqueia pulo para supervisor', () => {
    const r = podeAvancarNivel(3, [0], false, '');
    expect(r.ok).toBe(false);
  });

  it('RH pode pular com justificativa', () => {
    const r = podeAvancarNivel(5, [0], true, 'Justificativa formal adequada do RH admin.');
    expect(r.ok).toBe(true);
  });

  it('níveis críticos', () => {
    expect(escalaCritica(9)).toBe(true);
    expect(escalaCritica(10)).toBe(true);
    expect(escalaCritica(2)).toBe(false);
  });

  it('só suspensão exige aprovação DP', () => {
    expect(requerAprovacaoDp(0)).toBe(false); // feedback
    expect(requerAprovacaoDp(1)).toBe(false); // verbal
    expect(requerAprovacaoDp(2)).toBe(false); // escrita
    expect(requerAprovacaoDp(3)).toBe(true); // suspensão 1
    expect(requerAprovacaoDp(5)).toBe(true); // suspensão 2
  });

  it('reintegração após 6 meses', () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 7);
    expect(sugerirReintegracao(d.toISOString().slice(0, 10))).toBe(true);
    expect(sugerirReintegracao(new Date().toISOString().slice(0, 10))).toBe(false);
  });

  it('texto modelo oficial preserva CLT 482', () => {
    const t = TEXTO_MODELO_OFICIAL('atraso reiterado');
    expect(t).toContain('artigo 482 da CLT');
    expect(t).toContain('atraso reiterado');
  });
});

describe('catálogo Siscad', () => {
  it('carrega 7 motivos CLT', () => {
    expect(SISCAD_MOTIVOS).toHaveLength(7);
  });

  it('DESIDIA tem submotivos de operação', () => {
    const subs = submotivosDoMotivo('DESIDIA NO DESEMPENHO DAS FUNCOES');
    expect(subs.length).toBeGreaterThan(10);
    expect(subs).toContain('ATRASOS RECORRENTES NA ENTRADA');
    expect(subs).toContain('DESCONECTAR LIGACOES');
  });
});
