import { dashboardSessionHeaders } from './dashboardSession';
import {
  parseMailingDias,
  parseMailingSaude,
  type MailingDias,
  type MailingRecomendacao,
  type MailingSaude,
} from '../../shared/contracts/mailing';

export const MAILING_SAUDE_URL = '/api/mailing-saude';
export const MAILING_INDICE_URL = '/api/mailing-indice';

/** Coletor roda a cada 10 min; acima disso o dado live está atrasado. */
export const MAILING_ATRASO_MIN = 25;

export type MailingFetchOpts =
  | { live: true; date?: never }
  | { live?: false; date: string };

export async function fetchMailingSaude(
  opts: MailingFetchOpts | AbortSignal = { live: true },
  signal?: AbortSignal,
): Promise<MailingSaude | null> {
  const ac = opts instanceof AbortSignal ? opts : signal;
  const mode: MailingFetchOpts = opts instanceof AbortSignal ? { live: true } : opts;
  const qs = mode.live || !mode.date ? 'live=1' : `date=${encodeURIComponent(mode.date.slice(0, 10))}`;
  const r = await fetch(`${MAILING_SAUDE_URL}?${qs}&t=${Date.now()}`, {
    headers: dashboardSessionHeaders(),
    signal: ac,
    cache: 'no-store',
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Falha ao carregar mailing (${r.status})`);
  }
  const raw = await r.json();
  const parsed = parseMailingSaude(raw);
  if (!parsed.ok) throw new Error(`Contrato mailing inválido: ${parsed.error}`);
  return parsed.value;
}

export async function fetchMailingDias(signal?: AbortSignal): Promise<MailingDias | null> {
  const r = await fetch(`${MAILING_INDICE_URL}?t=${Date.now()}`, {
    headers: dashboardSessionHeaders(),
    signal,
    cache: 'no-store',
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Falha ao carregar índice mailing (${r.status})`);
  }
  const parsed = parseMailingDias(await r.json());
  if (!parsed.ok) throw new Error(`Contrato índice inválido: ${parsed.error}`);
  return parsed.value;
}

/** Só alertas leves para Operação / badge: estoque + prioridade de mailing. */
export function alertasFolego(data: MailingSaude | null, campanha = 'TODAS'): MailingRecomendacao[] {
  if (!data) return [];
  return (data.recomendacoes || []).filter((r) => {
    if (r.tipo !== 'folego' && r.tipo !== 'desgaste' && r.tipo !== 'priorizar' && r.tipo !== 'health' && r.tipo !== 'estrategia') {
      return false;
    }
    if (campanha === 'TODAS') return true;
    return !r.campanha_op || r.campanha_op === campanha;
  });
}

/** Card de ação única para o Pulse (health/estratégia/fôlego). */
export function acaoMailingPulse(data: MailingSaude | null, campanha = 'TODAS'): MailingRecomendacao | null {
  const alertas = alertasFolego(data, campanha);
  const ordem = ['health', 'estrategia', 'folego', 'desgaste', 'priorizar'];
  for (const t of ordem) {
    const hit = alertas.find((a) => a.tipo === t);
    if (hit) return hit;
  }
  return alertas[0] || null;
}

/** updated_at vem em horário de Brasília sem fuso. */
export function minutosDesde(updatedAt: string, agora = new Date()): number {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(updatedAt) ? updatedAt : `${updatedAt}-03:00`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (agora.getTime() - t) / 60_000);
}
