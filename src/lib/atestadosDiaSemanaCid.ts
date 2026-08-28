import type { Atestado } from './atestadosEscala';

const DIA_NOME_COMPLETO: Record<string, string> = {
  Seg: 'segundas-feiras',
  Ter: 'terças-feiras',
  Qua: 'quartas-feiras',
  Qui: 'quintas-feiras',
  Sex: 'sextas-feiras',
  Sáb: 'sábados',
  Dom: 'domingos',
};

export const DIAS_SEMANA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

export function diaSemanaNomeCompleto(abrev: string): string {
  return DIA_NOME_COMPLETO[abrev] || abrev;
}

const CAPITULO_CID: Record<string, string> = {
  A: 'Infecciosas',
  B: 'Infecciosas',
  F: 'Saúde mental',
  J: 'Respiratório',
  K: 'Circulatório',
  M: 'Osteomuscular',
  N: 'Nervoso',
  R: 'Respiratório',
  S: 'Trauma',
  Z: 'Saúde geral',
};

export type DiaSemanaCidChartRow = {
  dia: string;
  total: number;
  [serie: string]: number | string;
};

export type DiaSemanaCidSerie = {
  key: string;
  label: string;
};

export type DiaSemanaCidAgregado = {
  chartData: DiaSemanaCidChartRow[];
  series: DiaSemanaCidSerie[];
  topCids: Array<{ cid: string; count: number; capitulo: string }>;
  semCid: number;
  totalComData: number;
};

export function normCid(cid?: string | null): string | null {
  const c = String(cid || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  return c || null;
}

export function cidCapitulo(cid: string): string {
  const letra = cid.match(/^([A-Z])/)?.[1];
  if (!letra) return 'Outros';
  return CAPITULO_CID[letra] || `Cap. ${letra}`;
}

/** 0=Seg … 6=Dom (ISO weekday alinhado ao calendário BR). */
export function diaSemanaIdx(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

function dataRefRow(r: Atestado): string | null {
  const ref = r.data_inicio || r.created_at?.slice(0, 10);
  return ref && ref.length >= 10 ? ref.slice(0, 10) : null;
}

/** Agrupa atestados por dia da semana × top CIDs (início do afastamento). */
export function agregarDiaSemanaCid(rows: Atestado[], topN = 5): DiaSemanaCidAgregado {
  const matriz = DIAS_SEMANA_LABEL.map((dia) => ({
    dia,
    total: 0,
    porCid: new Map<string, number>(),
  }));

  const globalCid = new Map<string, number>();
  let semCid = 0;
  let totalComData = 0;

  for (const r of rows) {
    const ref = dataRefRow(r);
    if (!ref) continue;
    totalComData++;
    const idx = diaSemanaIdx(ref);
    const slot = matriz[idx];
    slot.total++;

    const cid = normCid(r.cid);
    if (!cid) {
      semCid++;
      slot.porCid.set('__sem_cid__', (slot.porCid.get('__sem_cid__') || 0) + 1);
      continue;
    }
    slot.porCid.set(cid, (slot.porCid.get(cid) || 0) + 1);
    globalCid.set(cid, (globalCid.get(cid) || 0) + 1);
  }

  const topCids = [...globalCid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([cid, count]) => ({ cid, count, capitulo: cidCapitulo(cid) }));

  const topKeys = new Set(topCids.map((t) => t.cid));
  const series: DiaSemanaCidSerie[] = [
    ...topCids.map((t) => ({ key: t.cid, label: t.cid })),
    { key: 'Outros', label: 'Outros CIDs' },
  ];
  if (semCid > 0) series.push({ key: 'Sem CID', label: 'Sem CID' });

  const chartData: DiaSemanaCidChartRow[] = matriz.map(({ dia, total, porCid }) => {
    const row: DiaSemanaCidChartRow = { dia, total };
    let outros = 0;
    for (const [cid, n] of porCid) {
      if (cid === '__sem_cid__') continue;
      if (topKeys.has(cid)) row[cid] = n;
      else outros += n;
    }
    if (outros > 0) row.Outros = outros;
    const sem = porCid.get('__sem_cid__') || 0;
    if (sem > 0) row['Sem CID'] = sem;
    for (const s of series) {
      if (row[s.key] === undefined) row[s.key] = 0;
    }
    return row;
  });

  return { chartData, series, topCids, semCid, totalComData };
}
