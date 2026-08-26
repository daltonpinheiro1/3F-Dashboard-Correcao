import { jsPDF } from 'jspdf';
import {
  TEXTO_MODELO_OFICIAL,
  TEXTO_RECUSA_CIENCIA,
  type Advertencia,
} from './advertenciasEscala';

const LOGO_H =
  'https://storage.directlinecontactcenter.com.br/docspost/Logo_horizontal_preta.png';
const LOGO_V =
  'https://storage.directlinecontactcenter.com.br/docspost/Logo_vertical_azul.png';

const NAVY = { r: 15, g: 35, b: 75 }; // azul marca 3F

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
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

function wrap(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH = 5.2): number {
  const lines = doc.splitTextToSize(text, maxW) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

/**
 * PDF alinhado ao modelo oficial "DOCUMENTO DE AÇÃO DISCIPLINAR".
 * Campos estruturais imutáveis; identidade visual 3F (logo + navy).
 */
export async function gerarPdfAdvertencia(a: Advertencia): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;

  const logo = (await loadImageDataUrl(LOGO_H)) || (await loadImageDataUrl(LOGO_V));
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margin, 10, 42, 14);
    } catch {
      /* logo opcional */
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('3F Contact Center', pageW - margin, 16, { align: 'right' });
  doc.text('Gestão de Conduta · Escala Pedagógica', pageW - margin, 20, { align: 'right' });

  // Faixa título (modelo oficial)
  const titleY = 30;
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(margin, titleY, contentW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('DOCUMENTO DE AÇÃO DISCIPLINAR', pageW / 2, titleY + 8, { align: 'center' });

  let y = titleY + 22;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const nome = (a.colaborador_nome || '').toUpperCase();
  doc.text(`Ao funcionário, ${nome}.`, margin, y);
  y += 8;

  if (a.colaborador_matricula) {
    doc.setFontSize(10);
    doc.text(`MATRÍCULA: ${a.colaborador_matricula}`, margin, y);
    y += 6;
  }
  if (a.colaborador_cpf) {
    doc.text(`CPF: ${a.colaborador_cpf}`, margin, y);
    y += 6;
  }
  doc.text(`CARGO: ${a.colaborador_cargo || '—'}`, margin, y);
  y += 6;
  doc.text(`NÍVEL DA MEDIDA: ${a.nivel_label}`, margin, y);
  y += 6;
  doc.text(`DATA DO OCORRIDO: ${formatDateBr(a.data_ocorrido)}`, margin, y);
  y += 10;

  // Caixa corpo jurídico (modelo oficial)
  const motivo = a.motivo_texto || a.motivo_categoria;
  const corpo = TEXTO_MODELO_OFICIAL(motivo);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  const boxTop = y;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(corpo, contentW - 8) as string[];
  const boxH = lines.length * 5.2 + 10;
  doc.rect(margin, boxTop, contentW, boxH);
  doc.setTextColor(30, 30, 30);
  doc.text(lines, margin + 4, boxTop + 7);
  y = boxTop + boxH + 8;

  if (a.descricao?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Descrição do ocorrido:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    y = wrap(doc, a.descricao.trim(), margin, y, contentW, 4.8);
    y += 4;
  }

  // Ciente / assinaturas
  doc.setDrawColor(160, 160, 160);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Ciente,', margin, y);
  y += 16;

  const colW = (contentW - 10) / 2;
  doc.setDrawColor(40, 40, 40);
  doc.line(margin, y, margin + colW, y);
  doc.line(margin + colW + 10, y, pageW - margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Colaborador', margin + colW / 2, y, { align: 'center' });
  doc.text('Empresa', margin + colW + 10 + colW / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(9);
  doc.text('____________________, ______ de ____________________ de 20 ______', pageW / 2, y, {
    align: 'center',
  });
  y += 12;

  // Testemunhas (recusa)
  doc.setDrawColor(160, 160, 160);
  doc.line(margin, y, pageW - margin, y);
  y += 7;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  y = wrap(doc, TEXTO_RECUSA_CIENCIA, margin, y, contentW, 4);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(40, 40, 40);
  doc.line(margin, y, margin + colW, y);
  doc.line(margin + colW + 10, y, pageW - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.text(`Nome: ${a.testemunha1_nome || '________________'}`, margin, y);
  doc.text(`Nome: ${a.testemunha2_nome || '________________'}`, margin + colW + 10, y);
  y += 5;
  doc.text(`CPF: ${a.testemunha1_cpf || '________________'}`, margin, y);
  doc.text(`CPF: ${a.testemunha2_cpf || '________________'}`, margin + colW + 10, y);

  // Rodapé
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    `Doc. gerado em ${new Date().toLocaleString('pt-BR')} · Supervisor: ${a.criado_por_nome || '—'} · ID ${a.id.slice(0, 8)}`,
    pageW / 2,
    287,
    { align: 'center' },
  );

  return doc.output('blob');
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDateBr(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}
