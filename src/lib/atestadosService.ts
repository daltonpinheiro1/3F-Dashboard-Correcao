import { dashboardSessionHeaders } from './dashboardSession';
import type { Atestado, AtestadoCreate, IaAnalise } from './atestadosEscala';

export const ATESTADOS_PAGE_LIMIT = 100;

export type ListAtestadosPage = {
  rows: Atestado[];
  next_cursor: string | null;
  has_more: boolean;
  limit?: number;
  storage?: string;
};

async function apiFetch(pathQuery: string, init: RequestInit): Promise<Response> {
  const headers = dashboardSessionHeaders(init.headers);
  return fetch(`/api/atestados${pathQuery}`, { ...init, headers });
}

export async function listAtestadosPage(opts?: {
  cursor?: string | null;
  limit?: number;
  status?: string | null;
  ano?: string | null;
  colaborador?: string | null;
  id?: string | null;
}): Promise<ListAtestadosPage> {
  const q = new URLSearchParams();
  if (opts?.id) {
    q.set('id', opts.id);
  } else {
    if (opts?.cursor) q.set('cursor', opts.cursor);
    q.set('limit', String(opts?.limit ?? ATESTADOS_PAGE_LIMIT));
    if (opts?.status) q.set('status', opts.status);
    if (opts?.ano) q.set('ano', opts.ano);
    if (opts?.colaborador) q.set('colaborador', opts.colaborador);
  }
  const qs = q.toString() ? `?${q.toString()}` : '';
  const r = await apiFetch(qs, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ListAtestadosPage & { error?: string };
  if (!r.ok) throw new Error(data.error || `Falha ao listar atestados (${r.status})`);
  return {
    rows: data.rows || [],
    next_cursor: data.next_cursor ?? null,
    has_more: Boolean(data.has_more),
    limit: data.limit,
    storage: data.storage,
  };
}

export async function listAtestadosAll(opts?: {
  status?: string | null;
  ano?: string | null;
  maxPages?: number;
}): Promise<Atestado[]> {
  const all: Atestado[] = [];
  let cursor: string | null = null;
  const max = opts?.maxPages ?? 30;
  for (let i = 0; i < max; i++) {
    const page = await listAtestadosPage({
      cursor,
      status: opts?.status,
      ano: opts?.ano,
    });
    all.push(...page.rows);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

export async function createAtestado(
  payload: AtestadoCreate & {
    imagem_base64?: string;
    imagem_thumb_base64?: string | null;
    ignorar_duplicidade?: boolean;
  },
): Promise<Atestado> {
  const r = await apiFetch('', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await r.json().catch(() => ({}))) as {
    row?: Atestado;
    error?: string;
    duplicidades?: unknown;
  };
  if (r.status === 409) {
    const err = new Error(data.error || 'Conflito de duplicidade.') as Error & {
      duplicidades?: unknown;
      status?: number;
    };
    err.duplicidades = data.duplicidades;
    err.status = 409;
    throw err;
  }
  if (!r.ok) throw new Error(data.error || `Falha ao protocolar (${r.status})`);
  if (!data.row) throw new Error('Resposta inválida ao criar atestado.');
  return data.row;
}

export type AtestadosStats = {
  pendentes: number;
  protocolados: number;
  em_analise: number;
  inss_alertas: number;
  smb_pendentes: number;
};

export async function fetchAtestadosStats(): Promise<AtestadosStats | null> {
  try {
    const headers = dashboardSessionHeaders();
    const r = await fetch('/api/atestados-stats', { headers });
    if (!r.ok) return null;
    return (await r.json()) as AtestadosStats;
  } catch {
    return null;
  }
}

export async function updateAtestado(
  id: string,
  patch: Partial<Atestado>,
): Promise<Atestado> {
  const r = await apiFetch(`?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const data = (await r.json().catch(() => ({}))) as { row?: Atestado; error?: string };
  if (!r.ok) throw new Error(data.error || `Falha ao atualizar (${r.status})`);
  if (!data.row) throw new Error('Resposta inválida ao atualizar atestado.');
  return data.row;
}

export async function analisarAtestadoImagem(opts: {
  imagem_base64: string;
  colaborador_nome?: string;
}): Promise<IaAnalise> {
  const headers = dashboardSessionHeaders();
  const r = await fetch('/api/atestado-analise', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts),
  });
  const data = (await r.json().catch(() => ({}))) as { analise?: IaAnalise; error?: string };
  if (!r.ok) throw new Error(data.error || `Falha na análise IA (${r.status})`);
  if (!data.analise) throw new Error('IA não retornou análise.');
  return data.analise;
}

export function contarAtestadosColaborador(rows: Atestado[], matricula?: string, nome?: string): number {
  const mat = String(matricula || '').trim();
  const n = String(nome || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (mat && r.colaborador_matricula === mat) return true;
    if (n && r.colaborador_nome.toLowerCase() === n) return true;
    return false;
  }).length;
}

export async function getAtestadoArquivoUrl(id: string): Promise<{
  url?: string;
  archive_url?: string | null;
  mime: string;
  nome?: string;
  is_thumbnail?: boolean;
  smb_unc?: string | null;
  smb_pending?: boolean;
  smb_synced?: boolean;
  preview_unavailable?: boolean;
  message?: string;
} | null> {
  const headers = dashboardSessionHeaders();
  const r = await fetch(`/api/atestado-arquivo?id=${encodeURIComponent(id)}`, { headers });
  const data = (await r.json().catch(() => ({}))) as {
    url?: string;
    archive_url?: string | null;
    mime?: string;
    nome?: string;
    error?: string;
    is_thumbnail?: boolean;
    smb_unc?: string | null;
    smb_pending?: boolean;
    smb_synced?: boolean;
    preview_unavailable?: boolean;
    message?: string;
  };
  if (!r.ok && !data.preview_unavailable) return null;
  if (data.preview_unavailable) {
    return {
      mime: data.mime || 'application/octet-stream',
      nome: data.nome,
      smb_unc: data.smb_unc,
      smb_pending: data.smb_pending,
      smb_synced: data.smb_synced,
      preview_unavailable: true,
      message: data.message,
    };
  }
  if (!data.url) return null;
  return {
    url: data.url,
    archive_url: data.archive_url,
    mime: data.mime || 'image/jpeg',
    nome: data.nome,
    is_thumbnail: data.is_thumbnail,
    smb_unc: data.smb_unc,
    smb_pending: data.smb_pending,
    smb_synced: data.smb_synced,
    preview_unavailable: false,
    message: data.message,
  };
}
