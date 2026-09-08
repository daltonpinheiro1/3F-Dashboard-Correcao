import type { RrHorizonte } from './rrHorizonte';

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

const LS_KEY = '3f-rr-acoes-v1';

function readLocal(): RrAcao[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as RrAcao[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: RrAcao[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-300)));
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
