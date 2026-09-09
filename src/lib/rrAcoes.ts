import type { RrHorizonte } from './rrHorizonte';
import { dashboardSessionHeaders } from './dashboardSession';

export type RrAcaoStatus = 'aberta' | 'feita' | 'sem_efeito';

export type RrAcao = {
  id: string;
  dataRef: string;
  campanha: string;
  horizonte: RrHorizonte;
  titulo: string;
  owner: string;
  prazo: string;
  status: RrAcaoStatus;
  createdAt: string;
};

const STORAGE_KEY = '3f-rr-acoes-v1';

function readLocal(): RrAcao[] {
  try {
    if (typeof sessionStorage === 'undefined') return [];
    const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const raw = sessionStorage.getItem(STORAGE_KEY) || legacy;
    if (legacy) {
      sessionStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(STORAGE_KEY);
    }
    const arr = raw ? (JSON.parse(raw) as RrAcao[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: RrAcao[]) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-300)));
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}

export function listRrAcoes(): RrAcao[] {
  return readLocal();
}

export function acoesDoRecorte(campanha: string, horizonte: RrHorizonte): RrAcao[] {
  return readLocal().filter((a) => a.campanha === campanha && a.horizonte === horizonte);
}

/** Abertas de outro dia — o que ficou da última reunião. */
export function acoesPendentesAnteriores(
  campanha: string,
  dataRef: string,
  nowIso = '',
): RrAcao[] {
  const hoje = (nowIso || dataRef).slice(0, 10);
  return readLocal().filter(
    (a) => a.campanha === campanha && a.status === 'aberta' && a.dataRef.slice(0, 10) < hoje,
  );
}

export function acaoAtrasada(a: RrAcao, hoje: string): boolean {
  return a.status === 'aberta' && a.prazo.slice(0, 10) < hoje.slice(0, 10);
}

export function upsertRrAcao(acao: RrAcao) {
  const rest = readLocal().filter((x) => x.id !== acao.id);
  writeLocal([...rest, acao]);
}

export function patchRrAcao(id: string, patch: Partial<Pick<RrAcao, 'status' | 'titulo' | 'owner' | 'prazo'>>) {
  const cur = readLocal().find((x) => x.id === id);
  if (!cur) return;
  upsertRrAcao({ ...cur, ...patch });
}

export async function fetchRrAcoes(campanha: string): Promise<RrAcao[]> {
  try {
    const r = await fetch(`/api/rr-actions?campanha=${encodeURIComponent(campanha)}`, {
      headers: dashboardSessionHeaders(),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = (await r.json()) as { actions?: RrAcao[] };
    const rows = Array.isArray(body.actions) ? body.actions : [];
    writeLocal(rows);
    return rows;
  } catch {
    return readLocal().filter((a) => a.campanha === campanha);
  }
}

export async function persistRrAcao(acao: RrAcao): Promise<RrAcao> {
  upsertRrAcao(acao);
  const r = await fetch('/api/rr-actions', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify(acao),
  });
  if (!r.ok) throw new Error(`Falha ao salvar ação (${r.status}).`);
  const body = (await r.json()) as { action?: RrAcao };
  const saved = body.action || acao;
  upsertRrAcao(saved);
  return saved;
}

export async function persistRrAcaoStatus(id: string, status: RrAcaoStatus): Promise<void> {
  patchRrAcao(id, { status });
  const r = await fetch('/api/rr-actions', {
    method: 'PATCH',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify({ id, status }),
  });
  if (!r.ok) throw new Error(`Falha ao atualizar ação (${r.status}).`);
}

export function buildRrAcao(opts: {
  dataRef: string;
  campanha: string;
  horizonte: RrHorizonte;
  titulo: string;
  owner: string;
  prazo: string;
  now?: Date;
}): RrAcao {
  const now = opts.now || new Date();
  return {
    id: `acao-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    dataRef: opts.dataRef.slice(0, 10),
    campanha: opts.campanha,
    horizonte: opts.horizonte,
    titulo: opts.titulo.trim().slice(0, 180),
    owner: opts.owner.trim().slice(0, 80) || 'RR',
    prazo: opts.prazo.slice(0, 10),
    status: 'aberta',
    createdAt: now.toISOString(),
  };
}
