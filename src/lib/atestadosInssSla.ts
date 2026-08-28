import { diasEfetivos, INSS_DIAS_LIMIAR, type PeriodoRef } from './atestadosDuplicidade';
import type { Atestado } from './atestadosEscala';

/** Prazo orientativo para encaminhamento INSS após 15º dia (dias úteis aproximados). */
export const INSS_SLA_DIAS_ORIENTATIVO = 5;

export type InssSlaInfo = {
  diasAfastamento: number;
  diasDesdeInicio: number;
  slaRestante: number;
  urgencia: 'ok' | 'atencao' | 'critico';
  label: string;
};

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function calcularInssSla(row: Atestado): InssSlaInfo | null {
  const dias = diasEfetivos(row as PeriodoRef);
  if (dias <= INSS_DIAS_LIMIAR) return null;
  const ini = row.data_inicio ? parseLocal(row.data_inicio) : null;
  if (!ini) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasDesdeInicio = Math.max(0, Math.round((hoje.getTime() - ini.getTime()) / 86_400_000));
  const limite = INSS_DIAS_LIMIAR + INSS_SLA_DIAS_ORIENTATIVO;
  const slaRestante = limite - diasDesdeInicio;

  let urgencia: InssSlaInfo['urgencia'] = 'ok';
  if (slaRestante <= 0) urgencia = 'critico';
  else if (slaRestante <= 2) urgencia = 'atencao';

  const label =
    slaRestante <= 0
      ? 'SLA estourado — encaminhar INSS'
      : slaRestante === 1
        ? '1 dia para encaminhar'
        : `${slaRestante} dias restantes`;

  return { diasAfastamento: dias, diasDesdeInicio, slaRestante, urgencia, label };
}

export function ordenarInssPorSla(rows: Atestado[]): Atestado[] {
  return [...rows].sort((a, b) => {
    const sa = calcularInssSla(a)?.slaRestante ?? 999;
    const sb = calcularInssSla(b)?.slaRestante ?? 999;
    return sa - sb;
  });
}
