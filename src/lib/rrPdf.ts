/**
 * One-pager PDF RR — brand 3F, 1 página A4 para comitê.
 */
import type { ForecastDia, MonteCarloDia } from './horaPageData';
import type { RrComparativo } from './rrComparativos';
import type { RrException } from './rrExceptions';
import type { RrFunilEtapa } from './rrFunil';
import type { RrSnapshot } from './rrExecutivo';
import type { Rr360Bloco } from './rr360';
import type { RrReconcile } from './rrReconcile';

const LOGO_H =
  'https://storage.directlinecontactcenter.com.br/docspost/Logo_horizontal_preta.png';
const NAVY = { r: 15, g: 35, b: 75 };
const TEAL = { r: 13, g: 148, b: 136 };

type JsPdfDoc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setFont: (f: string, s: string) => void;
  setFontSize: (n: number) => void;
  setTextColor: (...args: number[]) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (n: number) => void;
  text: (t: string | string[], x: number, y: number, o?: { align?: string }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (d: string, f: string, x: number, y: number, w: number, h: number) => void;
  splitTextToSize: (text: string, maxW: number) => string[];
  output: (type: 'blob') => Blob;
};

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_H, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type RrPdfInput = {
  dataRef: string;
  campanha: string;
  snap: RrSnapshot;
  rr360: Rr360Bloco | null;
  funil: RrFunilEtapa[];
  cmp: RrComparativo | null;
  exceptions: RrException[];
  forecast: ForecastDia | null;
  mc: MonteCarloDia | null;
  reconcile: RrReconcile | null;
  briefing?: string;
};

export async function gerarPdfRr(input: RrPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as unknown as JsPdfDoc;
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = 10;

  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margin, 8, 36, 12);
    } catch {
      /* opcional */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text('RR · Resultado Realizado', pageW - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`${input.dataRef} · ${input.campanha} · BRT · 3F Telecom`, pageW - margin, 17, { align: 'right' });

  y = 24;
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(margin, y, pageW - margin * 2, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const kpis = [
    ['EVA', String(input.snap.vendas)],
    ['Meta dia', String(input.snap.metaDia)],
    ['% meta', `${input.snap.pctMetaDia}%`],
    ['Gross', input.rr360?.aplicavel ? String(input.rr360.vendasBrutas) : '—'],
    ['Erro', input.rr360?.aplicavel ? `${input.rr360.taxaErroPct}%` : '—'],
    ['P(meta)', input.mc ? `${input.mc.probabilidade}%` : '—'],
  ];
  kpis.forEach((k, i) => {
    const x = margin + 6 + i * 32;
    doc.setFontSize(7);
    doc.text(k[0], x, y + 8);
    doc.setFontSize(12);
    doc.text(k[1], x, y + 16);
  });

  y = 52;
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Funil do dia', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(40);
  const funilTxt = input.funil.map((e) => `${e.label} ${e.valor}`).join('  →  ');
  const lines = doc.splitTextToSize(funilTxt || '—', pageW - margin * 2);
  doc.text(lines, margin, y);
  y += lines.length * 4 + 4;

  if (input.cmp) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text('Comparativos EVA', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);
    const vs1 = input.cmp.vsD1Pct != null ? `${input.cmp.vsD1Pct}%` : '—';
    const vs7 = input.cmp.vsD7Pct != null ? `${input.cmp.vsD7Pct}%` : '—';
    doc.text(
      `Hoje ${input.cmp.hoje.vendas}  ·  D−1 ${input.cmp.d1?.vendas ?? '—'} (${vs1})  ·  D−7 ${input.cmp.d7?.vendas ?? '—'} (${vs7})  ·  MTD ${input.cmp.mtdVendas}`,
      margin,
      y,
    );
    y += 8;
  }

  if (input.forecast && input.mc) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
    doc.text('Forecast / Monte Carlo', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);
    doc.text(
      `Otimista ${input.forecast.otimista} · Realista ${input.forecast.realista} · Pessimista ${input.forecast.pessimista} · P50 ${input.mc.projecaoP50} · P(atingir meta) ${input.mc.probabilidade}%`,
      margin,
      y,
    );
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 40, 40);
  doc.text('Exception board', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);
  if (!input.exceptions.length) {
    doc.text('Nenhum alerta fora do limiar.', margin, y);
    y += 6;
  } else {
    for (const ex of input.exceptions.slice(0, 6)) {
      doc.text(`• [${ex.nivel}] ${ex.titulo} — ${ex.detalhe}`, margin, y);
      y += 4.5;
    }
  }

  if (input.reconcile) {
    y += 2;
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Reconcile Gross EVA ${input.reconcile.eva} ↔ SMS ${input.reconcile.sms} (Δ ${input.reconcile.pct}%)`,
      margin,
      y,
    );
    y += 7;
  }

  if (input.briefing) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text('Briefing', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(50);
    const brief = doc.splitTextToSize(input.briefing.replace(/[#*_]/g, '').slice(0, 1800), pageW - margin * 2);
    const maxY = doc.internal.pageSize.getHeight() - 12;
    for (const line of brief) {
      if (y > maxY) break;
      doc.text(line, margin, y);
      y += 3.6;
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text('Gross = OS+ICCID · EVA = sucesso tabulado · TIM = Portado+FP  ·  Confidencial 3F', margin, 287);

  return doc.output('blob');
}
