/** Formatação e fetch — Disparos. */

import { dashboardSessionHeaders } from './dashboardSession';

export function n(v: number | undefined) {
  return typeof v === 'number' ? v.toLocaleString('pt-BR') : '—';
}

export function mesAtualBrt(): string {
  const sp = new Date(Date.now() - 3 * 3600_000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mesesChips(count = 3): string[] {
  const out: string[] = [];
  const sp = new Date(Date.now() - 3 * 3600_000);
  let y = sp.getUTCFullYear();
  let m = sp.getUTCMonth() + 1;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function fmtDelta(v: number, suffix = '') {
  const s = v > 0 ? `+${v}` : String(v);
  return `${s}${suffix}`;
}

/** Normaliza entrada para 3F-XXXXXXXX (mesma regra do backend). */
export function normalizePropostaInput(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^3F-/i.test(s)) return `3F-${s.replace(/^3F-/i, '')}`;
  if (/^\d+$/.test(s)) return `3F-${s}`;
  return s;
}

export async function fetchDashboardJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: dashboardSessionHeaders(), signal });
  let body: T & { error?: string };
  try {
    body = (await r.json()) as T & { error?: string };
  } catch {
    throw new Error(`Resposta inválida do servidor (${r.status}).`);
  }
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

export const POLL_MS = 10 * 60_000;

export const GRUPOS_FILTRO = [
  { id: '', label: 'Todas fatias' },
  { id: 'logistica', label: 'Logística' },
  { id: 'fila', label: 'Fila' },
  { id: 'ticket', label: 'Ticket' },
  { id: 'ordem', label: 'Ordem' },
  { id: 'fechamento', label: 'Fechamento' },
  { id: 'portabilidade', label: 'Pré-OS' },
] as const;

export const ACOES: { id: string; label: string }[] = [
  { id: 'consult', label: 'Consult' },
  { id: 'cancel', label: 'Cancel' },
  { id: 'open', label: 'Open' },
  { id: 'activate', label: 'Activate' },
  { id: 'reschedule', label: 'Reschedule' },
];

export const COR_BAR: Record<string, string> = {
  emerald: 'bg-emerald-600',
  rose: 'bg-rose-600',
  slate: 'bg-slate-500',
  red: 'bg-red-600',
  amber: 'bg-amber-500',
  sky: 'bg-sky-600',
  cyan: 'bg-cyan-600',
  teal: 'bg-teal-600',
  violet: 'bg-slate-700',
  indigo: 'bg-indigo-600',
  orange: 'bg-orange-500',
  blue: 'bg-blue-600',
  yellow: 'bg-amber-400',
};

export const COR_SOFT: Record<string, string> = {
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  teal: 'border-teal-200 bg-teal-50 text-teal-900',
  violet: 'border-slate-300 bg-slate-100 text-slate-900',
  red: 'border-red-200 bg-red-50 text-red-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};
