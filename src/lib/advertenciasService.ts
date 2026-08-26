import { supabase } from './supabase';
import type { Advertencia, AdvertenciaCreate, AdvertenciaStatus } from './advertenciasEscala';

const TABLE = 'advertencias';
const LS_KEY = '3f_advertencias_v1';

let storageMode: 'supabase' | 'api' | 'local' = 'supabase';
let tableReady: boolean | null = null;

function insightSecret(): string {
  return (import.meta.env.VITE_DASHBOARD_INSIGHT_SECRET || '').trim();
}

function insightHeaders(): HeadersInit | null {
  const secret = insightSecret();
  if (!secret) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
    'X-Dashboard-Session': secret,
  };
}

function uid(): string {
  return crypto.randomUUID();
}

function loadLocal(): Advertencia[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Advertencia[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(rows: Advertencia[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

async function probeTable(): Promise<boolean> {
  if (tableReady !== null) return tableReady;
  try {
    const { error } = await supabase.from(TABLE).select('id').limit(1);
    // PGRST205 = table missing in schema cache
    tableReady = !error;
    if (error && /PGRST205|schema cache|Could not find the table/i.test(error.message || '')) {
      tableReady = false;
    }
  } catch {
    tableReady = false;
  }
  return tableReady;
}

export function advertenciasStorageMode(): 'supabase' | 'api' | 'local' {
  return storageMode;
}

export function resetAdvertenciasProbe() {
  tableReady = null;
}

async function listViaApi(): Promise<Advertencia[] | null> {
  const headers = insightHeaders();
  if (!headers) return null;
  const r = await fetch('/api/advertencias', { headers });
  const data = (await r.json().catch(() => ({}))) as { rows?: Advertencia[]; error?: string };
  if (!r.ok) throw new Error(data.error || `API ${r.status}`);
  return (data.rows || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function listAdvertencias(): Promise<Advertencia[]> {
  if (await probeTable()) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (!error) {
      storageMode = 'supabase';
      return (data || []) as Advertencia[];
    }
    tableReady = false;
  }

  try {
    const rows = await listViaApi();
    if (rows) {
      storageMode = 'api';
      return rows;
    }
  } catch {
    /* fallback local */
  }

  storageMode = 'local';
  return loadLocal().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function createAdvertencia(input: AdvertenciaCreate): Promise<Advertencia> {
  const now = new Date().toISOString();
  const row: Advertencia = {
    ...input,
    id: uid(),
    created_at: now,
    updated_at: now,
    status: input.status || 'pendente',
    anexos: input.anexos || [],
  };

  if (await probeTable()) {
    const { data, error } = await supabase.from(TABLE).insert(row).select('*').single();
    if (!error && data) {
      storageMode = 'supabase';
      return data as Advertencia;
    }
    if (error) {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
      void _id;
      void _c;
      void _u;
      const retry = await supabase.from(TABLE).insert(rest).select('*').single();
      if (!retry.error && retry.data) {
        storageMode = 'supabase';
        return retry.data as Advertencia;
      }
      tableReady = false;
    }
  }

  try {
    const headers = insightHeaders();
    if (headers) {
      const r = await fetch('/api/advertencias', {
        method: 'POST',
        headers,
        body: JSON.stringify(row),
      });
      const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      storageMode = 'api';
      return (data.row || row) as Advertencia;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('createAdvertencia API fail:', e);
  }

  const all = loadLocal();
  all.unshift(row);
  saveLocal(all);
  storageMode = 'local';
  return row;
}

export async function updateAdvertenciaStatus(
  id: string,
  patch: Partial<Advertencia>,
): Promise<Advertencia | null> {
  if (await probeTable()) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (!error && data) {
      storageMode = 'supabase';
      return data as Advertencia;
    }
    tableReady = false;
  }

  try {
    const headers = insightHeaders();
    if (headers) {
      const r = await fetch('/api/advertencias', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, patch }),
      });
      const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
      if (!r.ok) throw new Error(data.error || `API ${r.status}`);
      storageMode = 'api';
      return (data.row || null) as Advertencia | null;
    }
  } catch {
    /* local */
  }

  const all = loadLocal();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
  saveLocal(all);
  storageMode = 'local';
  return all[idx];
}

export function kpisAdvertencias(rows: Advertencia[]) {
  const agora = new Date();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();
  const pendentes = rows.filter((r) => r.status === 'pendente').length;
  const noMes = rows.filter((r) => {
    const d = new Date(r.created_at || r.data_ocorrido);
    return d.getMonth() === mes && d.getFullYear() === ano;
  }).length;
  const hojeIso = agora.toISOString().slice(0, 10);
  const suspensoesAtivas = rows.filter((r) => {
    if (!(r.status === 'aprovada' || r.status === 'executada')) return false;
    const dias = r.dias_suspensao || 0;
    if (dias <= 0) return false;
    const base = r.aprovado_em || r.updated_at || r.created_at || r.data_ocorrido;
    const ini = new Date(base);
    if (Number.isNaN(ini.getTime())) return false;
    const fim = new Date(ini);
    fim.setDate(fim.getDate() + dias);
    return hojeIso <= fim.toISOString().slice(0, 10);
  }).length;
  const criticos = new Set(
    rows
      .filter((r) => (r.status === 'aprovada' || r.status === 'executada') && r.nivel_idx >= 9)
      .map((r) => (r.colaborador_matricula || r.colaborador_nome).trim().toLowerCase()),
  ).size;
  return { pendentes, noMes, suspensoesAtivas, criticos };
}

export function historicoColaborador(
  rows: Advertencia[],
  nome: string,
  matricula?: string,
): Advertencia[] {
  const n = nome.trim().toLowerCase();
  const m = (matricula || '').trim().toLowerCase();
  if (!n && !m) return [];
  return rows
    .filter((r) => {
      if (m && (r.colaborador_matricula || '').trim().toLowerCase() === m) return true;
      if (!n) return false;
      return (r.colaborador_nome || '').trim().toLowerCase() === n;
    })
    .sort((a, b) => (b.data_ocorrido || b.created_at || '').localeCompare(a.data_ocorrido || a.created_at || ''));
}

export function niveisAplicados(hist: Advertencia[]): number[] {
  return hist
    .filter((r) => r.status === 'aprovada' || r.status === 'executada')
    .map((r) => r.nivel_idx);
}

export const STATUS_LABEL: Record<AdvertenciaStatus, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  executada: 'Executada',
  cancelada: 'Cancelada',
};

export const STATUS_CLS: Record<AdvertenciaStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  aprovada: 'bg-emerald-100 text-emerald-800',
  recusada: 'bg-red-100 text-red-700',
  executada: 'bg-blue-100 text-blue-800',
  cancelada: 'bg-gray-100 text-gray-600',
};
