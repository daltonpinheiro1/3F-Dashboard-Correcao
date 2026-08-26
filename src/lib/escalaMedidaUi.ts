/** UI da escala pedagógica — categorias legíveis + mapeamento idx. */

import { ESCALA_PEDAGOGICA, nivelPorIdx, type NivelEscala } from './advertenciasEscala';

export type MedidaCategoria =
  | 'feedback_formal'
  | 'advertencia_verbal'
  | 'advertencia_escrita'
  | 'suspensao'
  | 'apuracao_juridica';

export type MedidaSelecao = {
  categoria: MedidaCategoria;
  /** Ciclo 1–4 quando categoria = advertencia_escrita */
  cicloEscrita?: number;
  /** Dias 1|2|3|5 quando categoria = suspensao */
  diasSuspensao?: number;
};

export const MEDIDA_CATEGORIAS: {
  id: MedidaCategoria;
  label: string;
  hint: string;
}[] = [
  { id: 'feedback_formal', label: 'Feedback formal', hint: '1ª etapa · PDF na hora' },
  { id: 'advertencia_verbal', label: 'Advertência verbal', hint: 'Orientação registrada · PDF na hora' },
  { id: 'advertencia_escrita', label: 'Advertência escrita', hint: 'Documento formal · PDF na hora' },
  { id: 'suspensao', label: 'Suspensão', hint: 'Aprovação do DP antes da impressão' },
  { id: 'apuracao_juridica', label: 'Apuração jurídica', hint: 'Estágio crítico · DP / Jurídico' },
];

export const ADVERTENCIA_ESCRITA_CICLOS = [
  { ciclo: 1, idx: 2, label: '1ª advertência escrita', contexto: 'Antes de qualquer suspensão' },
  { ciclo: 2, idx: 4, label: '2ª advertência escrita', contexto: 'Após suspensão de 1 dia' },
  { ciclo: 3, idx: 6, label: '3ª advertência escrita', contexto: 'Após suspensão de 2 dias' },
  { ciclo: 4, idx: 8, label: '4ª advertência escrita', contexto: 'Após suspensão de 3 dias' },
] as const;

export const SUSPENSAO_OPCOES = [
  { dias: 1, idx: 3, critico: false },
  { dias: 2, idx: 5, critico: false },
  { dias: 3, idx: 7, critico: false },
  { dias: 5, idx: 9, critico: true },
] as const;

const IDX_CATEGORIA: Record<number, MedidaCategoria> = {
  0: 'feedback_formal',
  1: 'advertencia_verbal',
  2: 'advertencia_escrita',
  3: 'suspensao',
  4: 'advertencia_escrita',
  5: 'suspensao',
  6: 'advertencia_escrita',
  7: 'suspensao',
  8: 'advertencia_escrita',
  9: 'suspensao',
  10: 'apuracao_juridica',
};

export function parseNivelIdx(idx: number): MedidaSelecao {
  const categoria = IDX_CATEGORIA[idx] ?? 'feedback_formal';
  if (categoria === 'advertencia_escrita') {
    const ciclo = ADVERTENCIA_ESCRITA_CICLOS.find((c) => c.idx === idx)?.ciclo ?? 1;
    return { categoria, cicloEscrita: ciclo };
  }
  if (categoria === 'suspensao') {
    const dias = SUSPENSAO_OPCOES.find((s) => s.idx === idx)?.dias ?? 1;
    return { categoria, diasSuspensao: dias };
  }
  return { categoria };
}

export function nivelIdxFromSelecao(sel: MedidaSelecao): number {
  switch (sel.categoria) {
    case 'feedback_formal':
      return 0;
    case 'advertencia_verbal':
      return 1;
    case 'apuracao_juridica':
      return 10;
    case 'advertencia_escrita': {
      const ciclo = sel.cicloEscrita ?? 1;
      return ADVERTENCIA_ESCRITA_CICLOS.find((c) => c.ciclo === ciclo)?.idx ?? 2;
    }
    case 'suspensao': {
      const dias = sel.diasSuspensao ?? 1;
      return SUSPENSAO_OPCOES.find((s) => s.dias === dias)?.idx ?? 3;
    }
    default:
      return 0;
  }
}

export function labelEtapa(n: NivelEscala): string {
  return `Etapa ${n.idx + 1} de ${ESCALA_PEDAGOGICA.length}`;
}

export function resumoMedida(idx: number): string {
  const n = nivelPorIdx(idx);
  const etapa = labelEtapa(n);
  if (n.diasSuspensao > 0) {
    return `${etapa} · Suspensão ${n.diasSuspensao} dia${n.diasSuspensao > 1 ? 's' : ''}${n.critico ? ' · CRÍTICO' : ''}`;
  }
  if (n.critico) return `${etapa} · Apuração jurídica · CRÍTICO`;
  const parsed = parseNivelIdx(idx);
  if (parsed.categoria === 'advertencia_escrita' && parsed.cicloEscrita) {
    const ciclo = ADVERTENCIA_ESCRITA_CICLOS.find((c) => c.ciclo === parsed.cicloEscrita);
    return `${etapa} · ${ciclo?.label ?? n.label}`;
  }
  return `${etapa} · ${n.label}`;
}

/** Opções agrupadas para filtros (Controle RH) — evita repetir label cru. */
export function opcoesFiltroNivel(): { value: string; label: string; group?: string }[] {
  const out: { value: string; label: string; group?: string }[] = [];
  for (const c of MEDIDA_CATEGORIAS) {
    if (c.id === 'feedback_formal') out.push({ value: '0', label: c.label, group: 'Medidas leves' });
    if (c.id === 'advertencia_verbal') out.push({ value: '1', label: c.label, group: 'Medidas leves' });
  }
  for (const ciclo of ADVERTENCIA_ESCRITA_CICLOS) {
    out.push({
      value: String(ciclo.idx),
      label: `${ciclo.label} — ${ciclo.contexto}`,
      group: 'Advertência escrita',
    });
  }
  for (const s of SUSPENSAO_OPCOES) {
    out.push({
      value: String(s.idx),
      label: `${s.dias} dia${s.dias > 1 ? 's' : ''}${s.critico ? ' · CRÍTICO' : ''}`,
      group: 'Suspensão',
    });
  }
  out.push({ value: '10', label: 'Apuração jurídica / DP', group: 'Crítico' });
  return out;
}
