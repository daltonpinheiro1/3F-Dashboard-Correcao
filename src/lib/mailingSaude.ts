import { dashboardSessionHeaders } from './dashboardSession';
import { parseMailingSaude, type MailingSaude } from '../../shared/contracts/mailing';

export const MAILING_SAUDE_URL = '/api/mailing-saude';

/** Coletor roda a cada 10 min; acima disso o dado está atrasado. */
export const MAILING_ATRASO_MIN = 25;

export async function fetchMailingSaude(signal?: AbortSignal): Promise<MailingSaude | null> {
  const r = await fetch(`${MAILING_SAUDE_URL}?t=${Date.now()}`, {
    headers: dashboardSessionHeaders(),
    signal,
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Falha ao carregar mailing (${r.status})`);
  }
  const parsed = parseMailingSaude(await r.json());
  if (!parsed.ok) throw new Error(`Contrato mailing inválido: ${parsed.error}`);
  return parsed.value;
}

/** updated_at vem em horário de Brasília sem fuso. */
export function minutosDesde(updatedAt: string, agora = new Date()): number {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(updatedAt) ? updatedAt : `${updatedAt}-03:00`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (agora.getTime() - t) / 60_000);
}
