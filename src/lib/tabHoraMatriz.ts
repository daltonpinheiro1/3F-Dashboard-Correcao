/** Matriz Tabulação × Hora (Discagens): valor visível = chave de ordenação. */

import { isTabEventoQueda } from './evaDash';

export type TabHoraMode = 'pct' | 'vol' | 'drop' | 'tma';

export const TAB_HORA_TOP = 40;

const HORAS_OP = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

export function horasComVolumeTabHora(
  rows: Array<{ horas?: Record<string, number> }> | undefined,
): number[] {
  const out = new Set<number>();
  for (const r of rows || []) {
    for (const [h, n] of Object.entries(r.horas || {})) {
      const hh = Number(String(h).replace(/h/i, ''));
      if (Number.isFinite(hh) && (n || 0) > 0) out.add(hh);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Matriz a partir de hora_motivo (aba Hora / operação) — mesma tabulação humana. */
export function buildTabHoraFromHoraMotivo(
  motivos: Array<{
    hora?: string | number;
    nome?: string;
    campanha_op?: string;
    total?: number;
  }>,
): Array<{
  nome: string;
  campanha_op: string;
  total: number;
  phones: number;
  pct_phones: number;
  drop_total: number;
  pct_drop: number;
  horas: Record<string, number>;
  pct_hora: Record<string, number>;
  horas_drop: Record<string, number>;
}> {
  const mat = new Map<string, { nome: string; campanha_op: string; horas: Record<string, number>; total: number }>();
  for (const r of motivos || []) {
    const nome = (r.nome || '').trim();
    if (!nome) continue;
    const hh = String(r.hora ?? '').replace(/h/i, '').padStart(2, '0').slice(-2);
    if (!HORAS_OP.includes(hh)) continue;
    const cop = r.campanha_op || 'OUTROS';
    const n = Number(r.total || 0);
    if (n <= 0) continue;
    const key = `${nome}||${cop}`;
    const acc = mat.get(key) || { nome, campanha_op: cop, horas: {}, total: 0 };
    acc.horas[hh] = (acc.horas[hh] || 0) + n;
    acc.total += n;
    mat.set(key, acc);
  }
  const horaTot: Record<string, Record<string, number>> = {};
  for (const v of mat.values()) {
    if (!horaTot[v.campanha_op]) horaTot[v.campanha_op] = {};
    for (const [h, n] of Object.entries(v.horas)) {
      horaTot[v.campanha_op][h] = (horaTot[v.campanha_op][h] || 0) + n;
    }
  }
  return [...mat.values()]
    .map((v) => {
      const horas: Record<string, number> = {};
      const pct_hora: Record<string, number> = {};
      const horas_drop: Record<string, number> = {};
      for (const h of HORAS_OP) {
        const n = v.horas[h] || 0;
        horas[h] = n;
        horas_drop[h] = 0;
        pct_hora[h] = rateTabHora(n, horaTot[v.campanha_op]?.[h] || 0);
      }
      return {
        nome: v.nome,
        campanha_op: v.campanha_op,
        total: v.total,
        phones: 0,
        pct_phones: 0,
        drop_total: 0,
        pct_drop: 0,
        horas,
        pct_hora,
        horas_drop,
      };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function preferTabHoraAtualizada<T extends { horas?: Record<string, number>; nome?: string; campanha_op?: string; drop_total?: number; horas_drop?: Record<string, number>; phones?: number; pct_phones?: number; total?: number }>(
  nativa: T[] | undefined,
  daOperacao: T[],
): T[] {
  const map = new Map<string, T>();
  for (const t of nativa || []) {
    const k = `${t.nome || ''}||${t.campanha_op || ''}`;
    map.set(k, { ...t, horas: { ...(t.horas || {}) } });
  }
  for (const r of daOperacao || []) {
    const k = `${r.nome || ''}||${r.campanha_op || ''}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...r, horas: { ...(r.horas || {}) } });
      continue;
    }
    const horas: Record<string, number> = { ...(prev.horas || {}) };
    for (const [h, n] of Object.entries(r.horas || {})) {
      if ((n || 0) > (horas[h] || 0)) horas[h] = n || 0;
    }
    map.set(k, {
      ...prev,
      ...r,
      horas,
      drop_total: prev.drop_total || r.drop_total,
      horas_drop: prev.horas_drop || r.horas_drop,
      phones: prev.phones ?? r.phones,
      pct_phones: prev.pct_phones ?? r.pct_phones,
    });
  }
  return [...map.values()]
    .map((r) => {
      const total = HORAS_OP.reduce((s, h) => s + (r.horas?.[h] || 0), 0);
      return { ...r, total } as T;
    })
    .sort((a, b) => (b.total || 0) - (a.total || 0) || String(a.nome || '').localeCompare(String(b.nome || '')));
}

export function tabHoraSortCol(hora: string) {
  return `_h_${hora}`;
}

/** Mesma regra de % da página Discagens (`rateFine`). */
export function rateTabHora(n: number, d: number) {
  if (!d) return 0;
  const pct = (100 * n) / d;
  return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
}

export type TabHoraCelula = {
  nome?: string;
  horas?: Record<string, number>;
  pct_hora?: Record<string, number>;
  tma_horas?: Record<string, number>;
  horas_drop?: Record<string, number>;
  drop_total?: number;
};

export type TabHoraSortOpts = {
  /** Sem bit Agente Desligou na matriz: ordena tabs de queda/desligou pelo volume (evento, não culpa). */
  dropFallbackEvento?: boolean;
};

/** Qtd Agente Desligou na célula — o que a tela mostra é o que a coluna ordena. */
export function valorCelulaTabHora(
  r: TabHoraCelula,
  hora: string,
  mode: TabHoraMode,
  opts?: TabHoraSortOpts,
): number {
  const vol = r.horas?.[hora] || 0;
  if (mode === 'pct') return r.pct_hora?.[hora] || 0;
  if (mode === 'vol') return vol;
  if (mode === 'drop') {
    const dropN = r.horas_drop?.[hora] || 0;
    if (dropN > 0) return dropN;
    if (opts?.dropFallbackEvento && isTabEventoQueda(r.nome)) return vol;
    return 0;
  }
  return r.tma_horas?.[hora] || 0;
}

/** Célula DROP agente: nunca pinta 0% (some o ruído). */
export function fmtDropCelula(dropN: number, vol: number): string {
  if (dropN > 0) {
    const pct = vol > 0 ? rateTabHora(dropN, vol) : 0;
    return `${dropN} · ${pct}%`;
  }
  if (vol > 0) return '—';
  return '';
}

/** Fallback visual: volume da tab de queda/desligou (evento operacional). */
export function fmtEventoDropCelula(vol: number, pctHora: number): string {
  if (vol <= 0) return '';
  return `${vol} · ${pctHora}%`;
}

export function rowTemDropAgente(r: TabHoraCelula): boolean {
  if ((r.drop_total || 0) > 0) return true;
  return Object.values(r.horas_drop || {}).some((n) => n > 0);
}

export function comSortPorHora<T extends TabHoraCelula>(
  rows: T[],
  horas: string[],
  mode: TabHoraMode,
  opts?: TabHoraSortOpts,
): T[] {
  return rows.map((r) => {
    const extra: Record<string, number> = {};
    for (const h of horas) extra[tabHoraSortCol(h)] = valorCelulaTabHora(r, h, mode, opts);
    return { ...r, ...extra };
  });
}
