/**
 * Snapshots diários da fila (eva-dash/portabilidade/disparos/{dia}.json).
 * Gerados na VM antes do cleanup de 7d — sem eles o escopo mês só via a última semana.
 */

import { sbFetch, type EnvAuth } from './auth';

export const ACOES_SNAPSHOT = ['consult', 'cancel', 'open', 'activate', 'reschedule'] as const;

/** Dias ≥ hoje−N são contados ao vivo na fila; mais velhos vêm do snapshot. */
export const JANELA_LIVE_DIAS = 5;

export type SnapshotAcao = {
  concluidas: number;
  falha: number;
  bko: number;
  enfileiradas: number;
};

export type SnapshotDia = {
  dia: string;
  exec_ok: number;
  exec_nok: number;
  por_acao: Record<string, SnapshotAcao>;
};

export type SomaSnapshots = {
  exec_ok: number;
  exec_nok: number;
  por_acao: Record<string, SnapshotAcao>;
  dias_lidos: string[];
  dias_sem_snapshot: string[];
};

const DAY_MS = 86_400_000;

/** ISO UTC de 00:00 BRT do dia `hoje − n`. */
export function inicioDiaBrtMenos(agora: Date, n: number): string {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - n, 3, 0, 0),
  ).toISOString();
}

/** Dias BRT (YYYY-MM-DD) em [startIso, endIso), limites em 00:00 BRT. */
export function diasBrtEntre(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const end = Date.parse(endIso);
  for (let t = Date.parse(startIso); t < end; t += DAY_MS) {
    out.push(new Date(t - 3 * 3600_000).toISOString().slice(0, 10));
  }
  return out;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseSnapshotDia(raw: unknown, dia: string): SnapshotDia | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (String(o.dia || '') !== dia) return null;
  const pa = (o.por_acao && typeof o.por_acao === 'object' ? o.por_acao : {}) as Record<
    string,
    Record<string, unknown>
  >;
  const por_acao: Record<string, SnapshotAcao> = {};
  for (const acao of ACOES_SNAPSHOT) {
    const r = pa[acao] || {};
    por_acao[acao] = {
      concluidas: num(r.concluidas),
      falha: num(r.falha),
      bko: num(r.bko),
      enfileiradas: num(r.enfileiradas),
    };
  }
  return { dia, exec_ok: num(o.exec_ok), exec_nok: num(o.exec_nok), por_acao };
}

/** Cloudflare free = 50 subrequests por invocação: dia avulso só como reserva. */
export const MAX_DIAS_AVULSOS = 6;

type BaixarJson = (obj: string) => Promise<unknown>;

function baixarDoStorage(env: EnvAuth): BaixarJson {
  return async (obj) => {
    try {
      const r = await sbFetch(env, `/storage/v1/object/eva-dash/portabilidade/disparos/${obj}`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch {
      return null;
    }
  };
}

/**
 * Lê `mes-YYYY-MM.json` (todos os dias do mês num objeto, gerado na VM) e só
 * cai no `{dia}.json` para os dias que faltarem, até MAX_DIAS_AVULSOS.
 */
export async function lerSnapshotsDias(
  env: EnvAuth,
  dias: string[],
  baixar: BaixarJson = baixarDoStorage(env),
): Promise<SomaSnapshots> {
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  const porMes = await Promise.all(meses.map((m) => baixar(`mes-${m}.json`)));
  const doMes = new Map<string, unknown>();
  porMes.forEach((raw) => {
    const ds = raw && typeof raw === 'object' ? (raw as { dias?: unknown }).dias : null;
    if (!ds || typeof ds !== 'object') return;
    for (const [dia, snap] of Object.entries(ds as Record<string, unknown>)) doMes.set(dia, snap);
  });
  const snaps: Array<SnapshotDia | null> = dias.map((dia) =>
    doMes.has(dia) ? parseSnapshotDia(doMes.get(dia), dia) : null,
  );
  const avulsos = dias
    .map((dia, i) => ({ dia, i }))
    .filter(({ i }) => !snaps[i])
    .slice(-MAX_DIAS_AVULSOS);
  const lidos = await Promise.all(avulsos.map(({ dia }) => baixar(`${dia}.json`)));
  avulsos.forEach(({ dia, i }, j) => {
    snaps[i] = parseSnapshotDia(lidos[j], dia);
  });
  return somarSnapshots(dias, snaps);
}

export type ExecMes = {
  exec_ok: number;
  exec_nok: number;
  activate_ok: number;
  dias_sem_snapshot: string[];
  completa: boolean;
};

/**
 * Execuções do mês = snapshots (dias < hoje−N) + contagem ao vivo (dias recentes).
 * `contar` recebe filtros PostgREST da fila_acoes_portabilidade.
 */
export async function execucoesDoMes(opts: {
  start: string;
  end: string;
  agora: Date;
  lerDias: (dias: string[]) => Promise<SomaSnapshots>;
  contar: (params: Record<string, string>) => Promise<number>;
}): Promise<ExecMes> {
  const cutoff = inicioDiaBrtMenos(opts.agora, JANELA_LIVE_DIAS);
  const liveStart = cutoff > opts.start ? cutoff : opts.start;
  const liveVazio = liveStart >= opts.end;
  const dias = liveStart > opts.start ? diasBrtEntre(opts.start, liveStart < opts.end ? liveStart : opts.end) : [];
  const rng = `(executed_at.gte.${liveStart},executed_at.lt.${opts.end})`;
  const live = (p: Record<string, string>) => (liveVazio ? Promise.resolve(0) : opts.contar({ ...p, and: rng }));
  const [snap, ok, nok, act] = await Promise.all([
    dias.length ? opts.lerDias(dias) : Promise.resolve(null),
    live({ resultado_is_valid: 'eq.true' }),
    live({ resultado_is_valid: 'eq.false' }),
    live({ acao: 'eq.activate', status: 'eq.concluida' }),
  ]);
  const sem = snap?.dias_sem_snapshot || [];
  return {
    exec_ok: ok + (snap?.exec_ok || 0),
    exec_nok: nok + (snap?.exec_nok || 0),
    activate_ok: act + (snap?.por_acao.activate?.concluidas || 0),
    dias_sem_snapshot: sem,
    completa: sem.length === 0,
  };
}

export function somarSnapshots(dias: string[], snaps: Array<SnapshotDia | null>): SomaSnapshots {
  const por_acao: Record<string, SnapshotAcao> = {};
  for (const acao of ACOES_SNAPSHOT) {
    por_acao[acao] = { concluidas: 0, falha: 0, bko: 0, enfileiradas: 0 };
  }
  const soma: SomaSnapshots = {
    exec_ok: 0,
    exec_nok: 0,
    por_acao,
    dias_lidos: [],
    dias_sem_snapshot: [],
  };
  dias.forEach((dia, i) => {
    const s = snaps[i];
    if (!s) {
      soma.dias_sem_snapshot.push(dia);
      return;
    }
    soma.dias_lidos.push(dia);
    soma.exec_ok += s.exec_ok;
    soma.exec_nok += s.exec_nok;
    for (const acao of ACOES_SNAPSHOT) {
      const a = s.por_acao[acao];
      const t = por_acao[acao];
      t.concluidas += a.concluidas;
      t.falha += a.falha;
      t.bko += a.bko;
      t.enfileiradas += a.enfileiradas;
    }
  });
  return soma;
}
