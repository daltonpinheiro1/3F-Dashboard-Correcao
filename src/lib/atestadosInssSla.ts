import { agruparAlertasInss, type AlertaInss } from '../../functions/_lib/atestadosInss';
import type { Atestado } from './atestadosEscala';

export {
  agruparAlertasInss,
  cidRaiz,
  INSS_JANELA_RECORRENCIA_DIAS,
  type AlertaInss,
} from '../../functions/_lib/atestadosInss';

/** Prazo orientativo para encaminhamento INSS após 15º dia (dias úteis aproximados). */
export const INSS_SLA_DIAS_ORIENTATIVO = 5;

export type InssSlaInfo = {
  diasAfastamento: number;
  diasDesdeInicio: number;
  slaRestante: number;
  urgencia: 'ok' | 'atencao' | 'critico';
  label: string;
};

const DIA_MS = 86_400_000;

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function calcularInssSlaAlerta(alerta: AlertaInss<Atestado>, hoje = new Date()): InssSlaInfo | null {
  if (!alerta.dia16 || !alerta.inicio) return null;
  const ref = new Date(hoje);
  ref.setHours(0, 0, 0, 0);
  const diasDesdeInicio = Math.max(0, Math.round((ref.getTime() - parseLocal(alerta.inicio).getTime()) / DIA_MS));
  const diasDesdeDia16 = Math.round((ref.getTime() - parseLocal(alerta.dia16).getTime()) / DIA_MS);
  const slaRestante = INSS_SLA_DIAS_ORIENTATIVO - diasDesdeDia16;

  let urgencia: InssSlaInfo['urgencia'] = 'ok';
  if (slaRestante <= 0) urgencia = 'critico';
  else if (slaRestante <= 2) urgencia = 'atencao';

  const label =
    slaRestante <= 0
      ? 'SLA estourado — encaminhar INSS'
      : slaRestante === 1
        ? '1 dia para encaminhar'
        : `${slaRestante} dias restantes`;

  return { diasAfastamento: alerta.dias_acumulados, diasDesdeInicio, slaRestante, urgencia, label };
}

/** SLA de um atestado isolado (> 15 dias por si só). */
export function calcularInssSla(row: Atestado, hoje = new Date()): InssSlaInfo | null {
  const alerta = agruparAlertasInss([{ ...row, cid: null }])[0];
  return alerta ? calcularInssSlaAlerta(alerta, hoje) : null;
}

export function ordenarAlertasInssPorSla(
  alertas: AlertaInss<Atestado>[],
  hoje = new Date(),
): AlertaInss<Atestado>[] {
  return [...alertas].sort((a, b) => {
    const sa = calcularInssSlaAlerta(a, hoje)?.slaRestante ?? 999;
    const sb = calcularInssSlaAlerta(b, hoje)?.slaRestante ?? 999;
    return sa - sb;
  });
}

export function ordenarInssPorSla(rows: Atestado[], hoje = new Date()): Atestado[] {
  return [...rows].sort((a, b) => {
    const sa = calcularInssSla(a, hoje)?.slaRestante ?? 999;
    const sb = calcularInssSla(b, hoje)?.slaRestante ?? 999;
    return sa - sb;
  });
}
