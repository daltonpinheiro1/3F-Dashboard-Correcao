import { dashboardSessionHeaders } from './dashboardSession';
import { requerAprovacaoDp, type Advertencia, type AdvertenciaCreate, type AdvertenciaStatus } from './advertenciasEscala';

let storageMode: 'api' | 'offline' = 'api';

function uid(): string {
  return crypto.randomUUID();
}

export function advertenciasStorageMode(): 'api' | 'offline' {
  return storageMode;
}

export function resetAdvertenciasProbe() {
  /* compat — single-store via API */
}

async function apiFetch(init: RequestInit): Promise<Response> {
  const headers = dashboardSessionHeaders(init.headers);
  return fetch('/api/advertencias', { ...init, headers });
}

export async function listAdvertencias(): Promise<Advertencia[]> {
  const r = await apiFetch({ method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as { rows?: Advertencia[]; error?: string; storage?: string };
  if (!r.ok) {
    storageMode = 'offline';
    throw new Error(data.error || `Falha ao listar advertências (${r.status})`);
  }
  storageMode = 'api';
  return (data.rows || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
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

  const r = await apiFetch({
    method: 'POST',
    body: JSON.stringify(row),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
  if (!r.ok) {
    storageMode = 'offline';
    throw new Error(data.error || `Falha ao salvar advertência (${r.status})`);
  }
  storageMode = 'api';
  return (data.row || row) as Advertencia;
}

export async function updateAdvertenciaStatus(
  id: string,
  patch: Partial<Advertencia>,
): Promise<Advertencia | null> {
  const r = await apiFetch({
    method: 'PATCH',
    body: JSON.stringify({ id, patch }),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: Advertencia; error?: string };
  if (!r.ok) {
    storageMode = 'offline';
    throw new Error(data.error || `Falha ao atualizar (${r.status})`);
  }
  storageMode = 'api';
  return (data.row || null) as Advertencia | null;
}

export type NotificarResult = {
  ok?: boolean;
  skipped?: boolean;
  error?: string;
  message?: string;
  to?: string;
};

export async function notificarSolicitanteAdvertencia(
  id: string,
  pdfBase64?: string,
  force = false,
): Promise<NotificarResult> {
  const r = await fetch('/api/advertencia-notificar', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify({ id, pdf_base64: pdfBase64, force }),
  });
  const data = (await r.json().catch(() => ({}))) as NotificarResult & { detalhe?: string };
  if (!r.ok && !data.skipped) {
    throw new Error(data.error || data.message || `Falha ao notificar (${r.status})`);
  }
  return data;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error('Falha ao converter PDF'));
    reader.readAsDataURL(blob);
  });
}

/** @deprecated — cliente não grava mais em localStorage (PII). */
export function clearLegacyLocalAdvertencias() {
  try {
    localStorage.removeItem('3f_advertencias_v1');
  } catch {
    /* ignore */
  }
}

export function kpisAdvertencias(rows: Advertencia[]) {
  const agora = new Date();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();
  // Suspensão e apuração jurídica aguardam DP
  const pendentes = rows.filter((r) => r.status === 'pendente' && requerAprovacaoDp(r.nivel_idx)).length;
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
