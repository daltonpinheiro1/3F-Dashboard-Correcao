import type { Advertencia } from './advertenciasEscala';

/** Extrai gestor de registros antigos (obs "Supervisor EVA: Nome"). */
export function parseSupervisorFromObs(obs?: string | null): string {
  const m = String(obs || '').match(/Supervisor EVA:\s*(.+)/i);
  return m?.[1]?.trim().split('\n')[0]?.trim() || '';
}

/** Nome do gestor para UI do DP — prioriza campo dedicado, senão fallback da obs. */
export function gestorDaAdvertencia(r: Pick<Advertencia, 'colaborador_supervisor' | 'observacoes_supervisor'>): string {
  const stored = String(r.colaborador_supervisor || '').trim();
  if (stored) return stored;
  return parseSupervisorFromObs(r.observacoes_supervisor);
}
