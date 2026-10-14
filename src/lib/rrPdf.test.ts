import { describe, expect, it, vi } from 'vitest';

const textos: string[] = [];

vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    rect() {}
    line() {}
    addImage() {}
    text(t: string | string[]) {
      textos.push(...(Array.isArray(t) ? t : [t]));
    }
    splitTextToSize(t: string, maxW: number) {
      const n = Math.max(1, Math.floor(maxW / 2));
      const out: string[] = [];
      for (const linha of t.split('\n')) {
        for (let i = 0; i < Math.max(1, linha.length); i += n) out.push(linha.slice(i, i + n));
      }
      return out;
    }
    output() {
      return new Blob(['pdf']);
    }
  },
}));

const { gerarPdfRr, textoPdf } = await import('./rrPdf');

const WIN_ANSI_OK = /^[\t\n\r\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]*$/;

describe('rrPdf', () => {
  it('textoPdf troca glifos fora do WinAnsi e preserva acentos', () => {
    expect(textoPdf('Discagem 10  →  CPC 4 · D−1 ↔ Δ 5% ≥ 15% — ação')).toBe(
      'Discagem 10  ->  CPC 4 · D-1 <-> Var. 5% >= 15% — ação',
    );
    expect(textoPdf('ok 🚀')).toBe('ok ');
  });

  it('PDF live não emite glifo que a fonte padrão corrompe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    textos.length = 0;
    await gerarPdfRr({
      dataRef: '2026-10-14',
      campanha: 'TODAS',
      horizonteLabel: 'Huddle realtime',
      isLive: true,
      resumo: { vendas: 10, meta: 20, pctMeta: 50, cpcPct: 40 },
      rr360: null,
      funil: [
        { id: 'discagem', label: 'Discagem', valor: 100, janela: 'dia', pctDoAnterior: null },
        { id: 'cpc', label: 'CPC', valor: 40, janela: 'dia', pctDoAnterior: 40 },
      ],
      cmp: {
        hoje: { dia: '2026-10-14', vendas: 10, cpcPct: 0 },
        d1: null,
        d7: null,
        spark: [],
        mtdVendas: 10,
        vsD1Pct: null,
        vsD7Pct: null,
      },
      exceptions: [
        { id: 'erro_critico', nivel: 'critico', titulo: 'Taxa de erro 20%', detalhe: 'Qualidade cadastral ≥ 15% — ofensor de correção.' },
      ],
      forecast: null,
      mc: null,
      reconcile: { eva: 10, sms: 8, delta: 2, pct: 20, alerta: false, limiarPct: 25 },
      briefing: '## Situação\n→ abaixo',
    });
    vi.unstubAllGlobals();
    expect(textos.length).toBeGreaterThan(5);
    for (const t of textos) expect(t).toMatch(WIN_ANSI_OK);
    expect(textos.join(' ')).toContain('Discagem 100  ->  CPC 40');
  });
});
